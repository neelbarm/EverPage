import assert from "node:assert/strict";
import { afterEach, beforeEach, mock, test } from "node:test";
import { db } from "@workspace/db";
import router from "./social";

type OwnedBook = { id: string; title: string; author: string; genre: string };
type Candidate = {
  userId: string; title: string; author: string; genre: string;
  coverColor: string; coverImageUri: string | null;
};
type Recommendation = Omit<Candidate, "userId"> & {
  id: string; reason: string; friendsCount: number;
};

// Exercise the registered production endpoint, not a copy of its ranking logic.
// Only its database result sets are replaced; no database or provider is contacted.
const handler = (router as unknown as {
  stack: { route?: { path: string; stack: { handle: (req: unknown, res: unknown) => Promise<void> }[] } }[];
}).stack.find((layer) => layer.route?.path === "/social/recommendations")?.route?.stack[0].handle;
assert.ok(handler);

let networkCalls = 0;
beforeEach(() => {
  networkCalls = 0;
  mock.method(globalThis, "fetch", async () => {
    networkCalls += 1;
    throw new Error("Recommendation regression tests must not access the network");
  });
});
afterEach(() => {
  try {
    assert.equal(networkCalls, 0);
  } finally {
    mock.restoreAll();
  }
});

async function recommend({
  own = [], sessions = [], following = [], others = [], limit,
}: {
  own?: OwnedBook[];
  sessions?: { bookId: string; durationMinutes: number }[];
  following?: string[];
  others?: Candidate[];
  limit?: string;
} = {}): Promise<Recommendation[]> {
  const results: unknown[][] = [own, sessions, following.map((id) => ({ id })), [], others];
  let reads = 0;
  mock.method(db, "select", (() => {
    assert.ok(reads < results.length, "Unexpected database query");
    let rows = results[reads++];
    const query: any = {
      from: () => query,
      where: () => query,
      orderBy: () => query,
      limit: (maximum: number) => { rows = rows.slice(0, maximum); return query; },
      then: (resolve: (value: unknown[]) => unknown, reject: (error: unknown) => unknown) =>
        Promise.resolve(rows).then(resolve, reject),
    };
    return query;
  }) as typeof db.select);
  let response: Recommendation[] | undefined;
  await handler!(
    { isAuthenticated: () => true, user: { id: "reader" }, query: { limit } },
    { json: (value: Recommendation[]) => { response = value; } },
  );
  assert.equal(reads, results.length);
  assert.ok(response);
  return response;
}

function book(title: string, genre: string, userId = "other", author = "Valid Author"): Candidate {
  return {
    userId, title, author, genre, coverColor: "#123456",
    coverImageUri: "https://example.invalid/fixture-cover.jpg",
  };
}

test("matching curated books cannot be crowded out by eight unrelated community books", async () => {
  const result = await recommend({
    own: [{ id: "mine", title: "My Literary Book", author: "My Author", genre: "Literary Fiction" }],
    sessions: [{ bookId: "mine", durationMinutes: 120 }],
    others: Array.from({ length: 8 }, (_, index) => book(`Mystery ${index}`, "Mystery", `other-${index}`)),
  });
  assert.equal(result.length, 8);
  assert.deepEqual(result.slice(0, 2).map((item) => item.id), ["rec_demon", "rec_lincoln"]);
  assert.ok(result.slice(0, 2).every((item) => item.reason === "it matches your literary fiction reading"));
});

test("reading-minute weights rank matching genres across both candidate sources", async () => {
  const result = await recommend({
    own: [
      { id: "literary", title: "My Literary Book", author: "My Author", genre: "Literary Fiction" },
      { id: "fantasy", title: "My Fantasy Book", author: "My Author", genre: "Fantasy" },
    ],
    sessions: [
      { bookId: "literary", durationMinutes: 120 },
      { bookId: "fantasy", durationMinutes: 10 },
    ],
    following: ["friend"],
    others: [book("Friend's Fantasy Book", "Fantasy", "friend")],
    limit: "3",
  });
  assert.deepEqual(result.map((item) => item.title), ["Demon Copperhead", "Lincoln in the Bardo", "Friend's Fantasy Book"]);
});

test("community genre ties retain friend, owner-count, and alphabetical priority", async () => {
  const result = await recommend({
    own: [{ id: "mine", title: "My Fantasy Book", author: "My Author", genre: "Fantasy" }],
    following: ["friend"],
    others: [
      book("Z Friend", "Fantasy", "friend"),
      book("B Popular", "Fantasy", "owner-1"),
      book("B Popular", "Fantasy", "owner-2"),
      book("C Solo", "Fantasy", "owner-3"),
      book("A Solo", "Fantasy", "owner-4"),
    ],
    limit: "5",
  });
  assert.deepEqual(result.map((item) => item.title), ["Z Friend", "B Popular", "A Solo", "C Solo", "Circe"]);
  assert.equal(result[0].friendsCount, 1);
  assert.equal(result[4].id, "rec_circe");
});

test("genre aliases match both community and curated books", async () => {
  const result = await recommend({
    own: [{ id: "mine", title: "My Science Book", author: "My Author", genre: "Sci-fi" }],
    sessions: [{ bookId: "mine", durationMinutes: 60 }],
    others: [book("Community Science", "Science Fiction"), book("Unrelated Mystery", "Mystery")],
    limit: "2",
  });
  assert.deepEqual(result.map((item) => item.title), ["Community Science", "Project Hail Mary"]);
  assert.equal(result[1].id, "rec_project_hail_mary");
});

test("shelf exclusion, quality filtering, and cross-source deduplication remain intact", async () => {
  const result = await recommend({
    own: [{ id: "mine", title: "  DEMON COPPERHEAD ", author: "BARBARA KINGSOLVER", genre: "Literary Fiction" }],
    others: [
      book("Demon Copperhead", "Literary Fiction", "owner-1", "Barbara Kingsolver"),
      book("Lincoln in the Bardo", "Literary Fiction", "owner-2", "George Saunders"),
      book(" lincoln in the bardo ", "Literary Fiction", "owner-3", "GEORGE SAUNDERS"),
      book("Unknown Author Book", "Literary Fiction", "owner-4", "Unknown"),
      { ...book("No Cover Book", "Literary Fiction"), coverImageUri: null },
      book("Truncated...", "Literary Fiction"),
    ],
  });
  assert.equal(result.filter((item) => item.title.trim().toLowerCase() === "lincoln in the bardo").length, 1);
  assert.ok(!result.some((item) => ["Demon Copperhead", "Unknown Author Book", "No Cover Book", "Truncated..."].includes(item.title)));
});

test("empty history keeps the existing curated order and honest fallback explanations", async () => {
  const result = await recommend();
  assert.deepEqual(result.map((item) => item.id), [
    "rec_demon", "rec_lincoln", "rec_normal", "rec_pachinko",
    "rec_educated", "rec_project_hail_mary", "rec_tomorrow", "rec_circe",
  ]);
  assert.ok(result.every((item) => item.reason === "a curated pick while we learn your preferences"));
  assert.ok(result.every((item) => item.friendsCount === 0));
});

test("returns no recommendations when every available title is already owned", async () => {
  const catalog = await recommend();
  const own = catalog.map(({ id, title, author, genre }) => ({ id, title, author, genre }));
  assert.deepEqual(await recommend({ own }), []);
});

test("limit remains bounded to one through eight with the same default", async () => {
  for (const [limit, expected] of [["99", 8], ["0", 1], ["-3", 1], ["3", 3], ["invalid", 8], [undefined, 8]] as const) {
    assert.equal((await recommend({ limit })).length, expected);
  }
});

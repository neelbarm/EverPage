import { Router, type IRouter, type Request, type Response } from "express";

const router: IRouter = Router();

const EFFECTIVE_DATE = "June 17, 2026";
const CONTACT_EMAIL = "privacy@everpage.app";

// Mirrors the in-app legal screen (artifacts/nexpage/app/legal.tsx). Served as a
// public web page so it can be used as the App Store Connect privacy policy URL.
const PRIVACY_SECTIONS: { title: string; body: string }[] = [
  { title: "1. Information We Collect", body: `When you create an account, we collect your email address, username, and display name. When you use the app, we record your reading activity (book titles, authors, pages read, session duration, and reading streak data). If you upload a profile picture, the image is stored securely. To send you reading reminders and nudges from friends, we collect your device's push notification token.` },
  { title: "2. How We Use Your Information", body: `We use your information solely to provide and improve EverPage. This includes syncing your reading data across sessions, enabling social features (followers, activity feed, nudges), sending optional reading reminders you configure, and displaying aggregate reading statistics. We do not sell your personal information to third parties.` },
  { title: "3. Social Features", body: `Your username, display name, profile picture, and reading activity (books you're reading, session summaries) are visible to users who follow you. Margin notes you write are visible to followers once they reach the same page. Room messages are visible to all room members. You control who follows you and can remove followers at any time.` },
  { title: "4. Data Sharing", body: `We use Expo (expo.dev) to deliver push notifications — your push token is transmitted to Expo's servers for this purpose. Profile pictures are stored using Google Cloud Storage. We do not share your reading activity, personal details, or usage data with advertisers or data brokers.` },
  { title: "5. Data Retention", body: `Your data is retained for as long as your account is active. When you delete your account (Settings → Account → Delete Account), all your personal data — including reading history, notes, streak records, and profile information — is permanently deleted within 24 hours.` },
  { title: "6. Children", body: `EverPage is intended for users aged 13 and older. We do not knowingly collect personal information from children under 13. If you believe a child under 13 has provided us with personal information, please contact us and we will delete it promptly.` },
  { title: "7. Security", body: `Passwords are hashed using bcrypt and never stored in plain text. All data transmission between the app and our servers uses HTTPS. Session tokens are stored securely on your device.` },
  { title: "8. Your Rights", body: `You may access, update, or delete your personal information at any time through the app. To export your data or submit a privacy request, contact us at ${CONTACT_EMAIL}.` },
  { title: "9. Changes to This Policy", body: `We may update this Privacy Policy from time to time. We will notify you of significant changes via the app or email. Continued use of EverPage after changes constitutes acceptance of the updated policy.` },
  { title: "10. Contact", body: `Questions about this Privacy Policy? Contact us at ${CONTACT_EMAIL}.` },
];

const TERMS_SECTIONS: { title: string; body: string }[] = [
  { title: "1. Acceptance", body: `By creating an account or using EverPage, you agree to these Terms of Service. If you do not agree, do not use the app.` },
  { title: "2. Eligibility", body: `You must be at least 13 years old to use EverPage. By using the app, you represent that you meet this requirement.` },
  { title: "3. Your Account", body: `You are responsible for maintaining the security of your account and password. You agree to notify us immediately of any unauthorized use of your account. You are responsible for all activity that occurs under your account.` },
  { title: "4. Acceptable Use", body: `You agree not to use EverPage to harass, threaten, or harm other users; post spam, misleading content, or content you do not have the right to share; attempt to access other users' accounts or our systems without authorization; or violate any applicable laws or regulations.` },
  { title: "5. Objectionable Content & Zero Tolerance", body: `EverPage has zero tolerance for objectionable content and abusive behavior. You may not post, share, or transmit content that is harassing, threatening, hateful, sexually explicit, violent, defamatory, or otherwise objectionable, and you may not abuse, stalk, or impersonate other users. We do not permit this content anywhere in the app, including profiles, usernames, margin notes, and room messages.` },
  { title: "6. Reporting, Blocking & Moderation", body: `You can report objectionable content or users at any time — tap the report option on a message or note, or open a user's profile and choose "Report user." You can also block any user from their profile, which immediately hides their content from you and yours from them and removes any connection between you. We review every report and act on violations — including removing content and suspending or terminating accounts — within 24 hours. To reach our moderation team directly, contact ${CONTACT_EMAIL}.` },
  { title: "7. User Content", body: `You own the content you create in EverPage (margin notes, quotes, messages). By posting content visible to others, you grant EverPage a limited license to display that content within the app. We reserve the right to remove content that violates these Terms.` },
  { title: "8. Intellectual Property", body: `Book cover images are sourced from OpenLibrary (openlibrary.org) and are used under their open access terms. Book titles, author names, and metadata are factual information not subject to copyright. EverPage's interface, design, and code are our intellectual property.` },
  { title: "9. Disclaimers", body: `EverPage is provided "as is" without warranties of any kind. We do not guarantee that the service will be uninterrupted, error-free, or that data will never be lost. We are not responsible for the content of books referenced within the app.` },
  { title: "10. Limitation of Liability", body: `To the fullest extent permitted by law, EverPage shall not be liable for any indirect, incidental, special, or consequential damages arising from your use of the app.` },
  { title: "11. Termination", body: `We may suspend or terminate your account if you violate these Terms. You may delete your account at any time via Settings.` },
  { title: "12. Governing Law", body: `These Terms are governed by applicable law. Disputes shall be resolved through binding arbitration or small claims court, not class action.` },
  { title: "13. Changes", body: `We may update these Terms. We will notify you of material changes. Continued use after changes constitutes acceptance.` },
  { title: "14. Contact", body: `Questions? Contact us at ${CONTACT_EMAIL}.` },
];

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function renderSections(sections: { title: string; body: string }[]): string {
  return sections
    .map(
      (s) =>
        `<section><h3>${escapeHtml(s.title)}</h3><p>${escapeHtml(s.body)}</p></section>`,
    )
    .join("\n");
}

function renderPage(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="index, follow" />
<title>EverPage — Privacy Policy &amp; Terms of Service</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #EDE8DF; color: #1C2B2D; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; }
  .wrap { max-width: 760px; margin: 0 auto; padding: 40px 22px 80px; }
  header { border-bottom: 1px solid rgba(28,90,96,0.18); padding-bottom: 20px; margin-bottom: 8px; }
  h1 { font-size: 26px; margin: 0 0 6px; color: #0F3E49; letter-spacing: -0.3px; }
  .sub { color: #6b6258; font-size: 14px; margin: 0; }
  nav { margin: 18px 0 6px; font-size: 14px; }
  nav a { color: #1C5A60; text-decoration: none; font-weight: 600; margin-right: 18px; }
  nav a:hover { text-decoration: underline; }
  h2 { font-size: 20px; color: #0F3E49; margin: 40px 0 4px; padding-top: 8px; }
  h3 { font-size: 15px; margin: 22px 0 4px; color: #1C2B2D; }
  p { margin: 0 0 4px; font-size: 15px; color: #2c3a3b; }
  a { color: #1C5A60; }
  footer { margin-top: 56px; padding-top: 18px; border-top: 1px solid rgba(28,90,96,0.18); color: #6b6258; font-size: 13px; }
</style>
</head>
<body>
  <div class="wrap">
    <header>
      <h1>EverPage</h1>
      <p class="sub">Privacy Policy &amp; Terms of Service · Effective ${EFFECTIVE_DATE}</p>
      <nav>
        <a href="#privacy">Privacy Policy</a>
        <a href="#terms">Terms of Service</a>
      </nav>
    </header>

    <h2 id="privacy">Privacy Policy</h2>
    ${renderSections(PRIVACY_SECTIONS)}

    <h2 id="terms">Terms of Service</h2>
    ${renderSections(TERMS_SECTIONS)}

    <footer>
      EverPage · Contact: <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>
    </footer>
  </div>
</body>
</html>`;
}

const PAGE = renderPage();

function serve(_req: Request, res: Response) {
  res.set("Content-Type", "text/html; charset=utf-8");
  res.set("Cache-Control", "public, max-age=3600");
  res.send(PAGE);
}

router.get("/legal", serve);
router.get("/privacy", serve);
router.get("/terms", serve);

export default router;

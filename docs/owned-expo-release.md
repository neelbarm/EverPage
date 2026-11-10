# EverPage owned Expo release

Use this checklist for a release; it does not record completed steps.

## Release identity

- Expo project: `@everpages-team/everpage`
- Expo project ID: `b743bd49-189f-471f-91c8-542032324ce1`
- Apple app ID: `6788593833`; Apple team: `L947N6YS9U`
- iOS bundle identifier: `app.everpage` (keep the existing Apple app)
- Production API: `https://nex-page.replit.app`

Keep the Replit API and database in place. Publish backend changes through Replit as a separate deployment. Build future iOS releases through this owned Expo project, not Replit's managed native Launch flow.

## 1. Check source, packaging and versions

Review the approved commit and run its regression checks. Confirm the intended release version in `app.json`. You can upload a TestFlight build before creating its App Store version record; leave any existing review submission untouched.

Run EAS commands from the mobile app directory:

```sh
cd artifacts/nexpage
npx --yes eas-cli@27.7.1 build:version:get -p ios -e production
```

Compare the remote build counter with the highest build number in App Store Connect. If needed, initialize the counter to at least that number; production auto-increment will use a higher number for the next build:

```sh
npx --yes eas-cli@27.7.1 build:version:set -p ios -e production
```

The production profile uses remote build numbers and auto-increment. Check the resulting build number as well as the marketing version.

Keep `.easignore` at the Git repository root. Inspect the upload archive: exclude `pluely/`, secrets, credentials and generated outputs; include the root pnpm lockfile/workspace configuration, workspace packages, mobile source and assets. Preserve the existing exclusion rules. Validate a frozen dependency install and iOS export before uploading source.

## 2. Build and submit the exact artifact

Verify the owned Expo project, Apple team, bundle identifier and production API. Check distribution signing and APNs credentials without revoking keys used by existing releases.

```sh
npx --yes eas-cli@27.7.1 build -p ios --profile production
```

Record the successful build ID and source commit. Replace `BUILD_ID` below with that ID, verify its version and bundle identifier, then submit it to the existing Apple app:

```sh
npx --yes eas-cli@27.7.1 build:view BUILD_ID
npx --yes eas-cli@27.7.1 submit -p ios --profile production --id BUILD_ID --wait
```

Use the exact ID, not `--latest`. After Apple processes the upload, find that version/build in TestFlight. Uploading does not release it to App Store customers.

## 3. Test the upgrade and notifications

Install the TestFlight build over an existing EverPage installation without uninstalling. Verify account access, saved reading data, queued session sync and the release's regression cases.

For the first owned-project upgrade, confirm the device registers its push token against the owned Expo project. With two test accounts, send a nudge using the actual **Friends → Nudge** button. Put the receiving app in the background or lock the phone, allow notifications, and verify both the visible notification and its Expo delivery receipt. Investigate receipt errors before release. An accepted Expo ticket alone does not prove delivery; even a successful receipt does not prove a visible banner.

## 4. Release through Apple

Select the tested build in the matching App Store Connect version. Complete release notes and required review information, submit for App Review, and check the approval status. Release the approved version according to its automatic/manual release setting, then confirm the public App Store version.

References: [EAS CLI commands](https://docs.expo.dev/eas/cli/), [monorepo setup](https://docs.expo.dev/build-reference/build-with-monorepos/), [archive exclusions](https://docs.expo.dev/build-reference/easignore/), [push receipts](https://docs.expo.dev/push-notifications/sending-notifications/).

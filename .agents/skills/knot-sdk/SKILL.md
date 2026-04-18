---
name: knot-sdk
description: >
  Install and initialize the Knot SDK to enable merchant account linking. Covers iOS,
  Android, React Native, Flutter, and Web. Use when: (1) "install the Knot SDK",
  (2) "initialize the SDK", (3) "set up the Knot SDK", (4) "integrate the Knot SDK",
  (5) "add the Knot SDK to my app", (6) "configure KnotConfiguration",
  (7) "handle SDK events".
metadata:
  author: Knot
  version: "1.0"
---

# Knot SDK

Install and initialize the Knot SDK to enable merchant account linking. The SDK handles the full authentication flow, including credential entry and step-up authentication (MFA).

## Before Starting: Load API Context

### Option A: Knot MCP (preferred)

If the `knot-docs` MCP server is available, use `ToolSearch` with query `+knot-docs` to load the platform-specific SDK page:

- `mcp__knot-docs__get_page_docs` with page `sdk/ios`
- `mcp__knot-docs__get_page_docs` with page `sdk/android`
- `mcp__knot-docs__get_page_docs` with page `sdk/react-native`
- `mcp__knot-docs__get_page_docs` with page `sdk/flutter`
- `mcp__knot-docs__get_page_docs` with page `sdk/web`

Only fetch the page for the platform being implemented.

If the `knot-docs` MCP is not installed, ask the user to run the following command in their terminal:

```bash
npx add-mcp https://docs.knotapi.com/mcp --name knot-docs
```

### Option B: No MCP available

If the MCP server cannot be installed or used, skip the MCP calls. The workflow below contains everything needed.

## Workflow

### Step 1: Install the SDK

**iOS (CocoaPods):**
```ruby
pod 'KnotAPI'
```

**iOS (Swift Package Manager):**
Add `https://github.com/millionscard/knot-api-ios` with "Up to Next Major Version" rule. Requires Swift 5.3+.

**Android (Gradle):**
```groovy
dependencies {
    implementation 'com.knotapi.knot:knotapi-android-sdk:<latest-version>'
}
```
Requires minSdkVersion 21 and Java 8.

**React Native:**
```bash
npm install react-native-knotapi --save
```

**Flutter:**
```bash
flutter pub add knotapi_flutter
```

**Web (npm):**
```bash
npm install knotapi-js@next --save
```

**Web (CDN):**
```html
<script src="https://unpkg.com/knotapi-js@next"></script>
```

### Step 2: Configure and open the SDK

The SDK requires a `session_id` from `POST /session/create` (called from the backend) and the `client_id` from the Knot Dashboard.

**Required parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `sessionId` | string | From backend `POST /session/create` |
| `clientId` | string | From Knot Dashboard, differs per environment |
| `environment` | string/enum | `development` or `production` |

**Optional parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `merchantIds` | int[] | none | Required for transaction data use cases. Otherwise, recommended to leave empty so the SDK displays its built-in merchant list. Pass a single merchant ID when displaying merchants natively in the app and the user selects one before opening the SDK. |
| `entryPoint` | string | none | **Strongly recommended.** Identifier for where the user invoked the SDK (e.g. "onboarding", "home", "settings"). Returned in the AUTHENTICATED webhook, enabling conversion analytics by entry point. |
| `useCategories` | boolean | true | Show merchant categories in the SDK UI |
| `useSearch` | boolean | true | Show search bar in the SDK UI |
| `metadata` | object | none | Key-value pairs (max 10 keys, 500 chars per value) echoed in webhook payloads |
| `locale` | string | "en-US" | BCP-47 tag. Supports `en-US` and `es-US`. |

**iOS (Swift):**
```swift
import KnotAPI

let configuration = KnotConfiguration(
    sessionId: sessionId,
    clientId: clientId,
    environment: .development,
    entryPoint: "onboarding"
)
Knot.open(configuration: configuration, delegate: self)
```

**Android (Kotlin):**
```kotlin
import com.knotapi.knot.*

val configuration = KnotConfiguration(
    sessionId = sessionId,
    clientId = clientId,
    environment = Environment.DEVELOPMENT,
    entryPoint = "onboarding"
)
Knot.open(context, configuration, eventDelegate)
```

**React Native:**
```javascript
import { Knot } from "react-native-knotapi";

Knot.open({
    sessionId: sessionId,
    clientId: clientId,
    environment: "development",
    entryPoint: "onboarding"
});
```

**Flutter:**
```dart
import 'package:knotapi_flutter/knotapi_flutter.dart';
import 'package:knotapi_flutter/knotapi_configuration.dart';

final knot = KnotapiFlutter();
knot.open(KnotConfiguration(
    sessionId: sessionId,
    clientId: clientId,
    environment: Environment.development,
    entryPoint: "onboarding"
));
```

**Web:**
```javascript
import KnotapiJS from "knotapi-js";
const knotapi = new KnotapiJS();

knotapi.open({
    sessionId: sessionId,
    clientId: clientId,
    environment: "development",
    entryPoint: "onboarding",
    onSuccess: (details) => {},
    onError: (errorCode, message) => {},
    onEvent: (event, merchant, merchantId, payload, taskId) => {},
    onExit: () => {}
});
```

### Step 3: Handle events

The SDK emits events during the authentication flow. Handle these to track progress and respond to outcomes.

**Event callbacks:**

| Callback | Trigger | Key data |
|----------|---------|----------|
| `onSuccess` | User successfully authenticated | `merchant` name |
| `onError` | SDK initialization failed | `errorCode`, `errorDescription` |
| `onExit` | User closed the SDK | none |
| `onEvent` | Lifecycle events during the flow | `event`, `merchant`, `merchantId`, `taskId`, `metaData` |

**Lifecycle events (via onEvent):**

| Event | Description |
|-------|-------------|
| `MERCHANT_CLICKED` | User selected a merchant |
| `LOGIN_STARTED` | User submitted credentials |
| `AUTHENTICATED` | Login succeeded |
| `OTP_REQUIRED` | MFA code requested |
| `REFRESH_SESSION_REQUEST` | Session expiring in ~5 seconds. Call the Extend Session API. |

**Error codes (via onError):**

| Code | Cause |
|------|-------|
| `INVALID_SESSION` | Session ID is invalid or mismatched |
| `EXPIRED_SESSION` | Session is older than 30 minutes |
| `INVALID_CLIENT_ID` | Client ID does not match the environment |
| `MERCHANT_ID_NOT_FOUND` | Required merchant ID is missing or invalid |
| `INTERNAL_ERROR` | Internal SDK error |

**Event handling by platform:**

- **iOS:** Implement the `KnotEventDelegate` protocol with `onSuccess`, `onError`, `onExit`, `onEvent` methods
- **Android:** Implement the `KnotEventDelegate` interface with the same methods
- **React Native:** Use `addKnotListener('knot:onSuccess', callback)`, `addKnotListener('knot:onError', callback)`, etc.
- **Flutter:** Subscribe to streams: `KnotapiFlutter.onSuccess.listen(callback)`, `KnotapiFlutter.onError.listen(callback)`, etc.
- **Web:** Pass callbacks inline to `knotapi.open({ onSuccess, onError, onEvent, onExit })`

**Cross-platform onEvent differences:**

| Property | iOS | Android | React Native | Flutter | Web |
|----------|-----|---------|-------------|---------|-----|
| event name | `event` | `getEvent()` | `event` | `event` | 1st param |
| merchant | `merchant` | `getMerchantName()` | `merchantName` | `merchant` | 2nd param |
| merchant ID | `merchantId` | `getMerchantId()` | `merchantId` | `merchantId` | 3rd param |
| metadata | `metaData` (NSDictionary) | `getMetaData()` (Map) | `metaData` (Record) | `metaData` (Map) | `payload` (4th param) |
| task ID | `taskId` | `getTaskId()` | `taskId` | `taskId` | 5th param |
| environment | `environment` | `getEnvironment()` | `environment` | `environment` | not in callback |
| Security questions event | `SECURITY_QUESTIONS_REQUIRED` | `SECURITY_QUESTIONS_REQUIRED` | `SECURITY_QUESTIONS_REQUIRED` | `SECURITY_QUESTIONS_REQUIRED` | `QUESTIONS_REQUIRED` |

### Step 4: Session management

- Sessions expire after 30 minutes. A session expiring while the user has the SDK open is exceptionally rare and not required to implement.
- Create a new session for each SDK invocation
- Optionally listen for the `REFRESH_SESSION_REQUEST` event (~5 seconds before expiry) and call the Extend Session API to keep the session alive

### Step 5: Close the SDK

To programmatically close the SDK:

- **iOS:** `Knot.close()`
- **Android:** `Knot.close()`
- **React Native:** `Knot.close()`
- **Flutter:** `knot.close()`
- **Web:** Not applicable (user closes the modal)

## Web SDK: Domain Allowlisting

For the Web SDK, application domains can be allowlisted in the Knot Dashboard at https://dashboard.knotapi.com/developers/domains. Ask the Knot team to enable this feature before configuring domains in the dashboard. When enabled, only allowlisted domains can invoke the SDK.

## Pitfalls

- **One session per invocation**: Do not reuse sessions across multiple SDK opens.
- **Session, environment, and clientId must all match**: The `sessionId`, `clientId`, and `environment` passed to the SDK must all correspond to the same environment. Creating a session with production credentials but passing `environment: development` to the SDK (or vice versa) will show a generic error screen. This is the most common integration issue.
- **Do not use SDK callbacks for server-side logic or analytics**: Use webhooks for all backend state changes (card switches, authentication, etc.) and analytics. SDK callbacks (`onSuccess`, `onError`, `onEvent`) are for client-side UX only and may not fire if the app is killed or the network drops. Webhooks are the source of truth.
- **React Native: avoid double teardown**: If app logic tears down the screen hosting the SDK more than once, it can cause crashes. Ensure the screen is only dismissed once.
- **Web domain allowlisting**: If domain allowlisting is enabled, the Web SDK will fail silently on non-allowlisted domains.
- **Web event name difference**: The Web SDK uses `QUESTIONS_REQUIRED` where all other platforms use `SECURITY_QUESTIONS_REQUIRED`.
- **React Native merchant name**: React Native uses `merchantName` in onEvent, while other platforms use `merchant`.

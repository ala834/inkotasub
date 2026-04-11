# INKOTA SUB — Android Native App Setup

## Prerequisites
- **Android Studio** installed (latest version)
- **Node.js** and **npm** installed
- Your project exported to GitHub

## Step-by-Step Setup

### 1. Export & Clone
1. Click **"Export to GitHub"** in Lovable
2. Clone the repo locally:
   ```bash
   git clone <your-repo-url>
   cd <your-project>
   ```

### 2. Install Dependencies
```bash
npm install
```

### 3. Add Android Platform
```bash
npx cap add android
```

### 4. Build & Sync
```bash
npm run build
npx cap sync android
```

### 5. Set Up Adaptive Launcher Icons

Android adaptive icons require two layers:
- **Foreground**: The INKOTA SUB logo (transparent background)
- **Background**: Solid orange/teal brand color

#### Icon Sizes by Density Bucket

| Density  | Size (px) | Path |
|----------|-----------|------|
| mdpi     | 48×48     | `android/app/src/main/res/mipmap-mdpi/` |
| hdpi     | 72×72     | `android/app/src/main/res/mipmap-hdpi/` |
| xhdpi    | 96×96     | `android/app/src/main/res/mipmap-xhdpi/` |
| xxhdpi   | 144×144   | `android/app/src/main/res/mipmap-xxhdpi/` |
| xxxhdpi  | 192×192   | `android/app/src/main/res/mipmap-xxxhdpi/` |

#### Adaptive Icon Foreground Sizes

| Density  | Size (px) |
|----------|-----------|
| mdpi     | 108×108   |
| hdpi     | 162×162   |
| xhdpi    | 216×216   |
| xxhdpi   | 324×324   |
| xxxhdpi  | 432×432   |

#### How to Generate Icons

**Option A: Use Android Studio**
1. Open the Android project: `npx cap open android`
2. Right-click `app/src/main/res` → **New → Image Asset**
3. Select **Launcher Icons (Adaptive and Legacy)**
4. For **Foreground**: Upload `public/inkota-logo.png`
5. For **Background**: Set color `#F97316` (orange) or `#0D9488` (teal)
6. Adjust padding/scaling so the logo isn't clipped
7. Click **Next → Finish**

**Option B: Use [Icon Kitchen](https://icon.kitchen/)** or **[Android Asset Studio](https://romannurik.github.io/AndroidAssetStudio/icons-launcher.html)**
1. Upload your logo
2. Set background color
3. Download the generated zip
4. Extract into `android/app/src/main/res/`

### 6. Set Up Splash Screen

After `npx cap add android`, place your splash screen drawable:

1. Create a `splash.png` (centered logo on brand-colored background)
2. Place it in:
   - `android/app/src/main/res/drawable/splash.png`
   - Or use the XML drawable approach for vector splash

The `capacitor.config.ts` is already configured with splash screen settings using your brand color `#0D9488`.

### 7. Run the App

**On Emulator:**
```bash
npx cap run android
```

**Or open in Android Studio:**
```bash
npx cap open android
```
Then click the ▶ Run button.

### 8. After Each Code Change

When you pull new changes from Lovable:
```bash
git pull
npm install
npx cap sync android
```

## OneSignal Push Notifications Setup

### 1. Create a OneSignal Account & App
1. Go to [OneSignal Dashboard](https://onesignal.com/)
2. Create an account or log in
3. Click **"New App/Website"** → name it (e.g., "INKOTA SUB")
4. Select **Android** platform
5. Enter your **Firebase Server Key** (from Firebase Console → Project Settings → Cloud Messaging)
6. Copy your **OneSignal App ID**

### 2. Update OneSignal App ID in Code
1. Open `src/hooks/usePushNotifications.ts`
2. Replace `YOUR_ONESIGNAL_APP_ID` with your actual OneSignal App ID

### 3. Add OneSignal Gradle Plugin
In `android/app/build.gradle`, add:
```gradle
plugins {
    id 'com.onesignal.androidsdk.onesignal-gradle-plugin' version '0.14.0'
}
```

In `android/build.gradle` (project-level), ensure you have:
```gradle
buildscript {
    repositories {
        gradlePluginPortal()
    }
}
```

### 4. Add google-services.json
OneSignal still uses FCM under the hood for Android delivery:
1. Go to [Firebase Console](https://console.firebase.google.com/) → Create/select project
2. Add Android app with package: `app.lovable.ffadf645a240467b9613fa616c1f2eb6`
3. Download `google-services.json` → place in `android/app/`
4. Add Firebase dependencies as described in OneSignal docs

### 5. Sync & Run
```bash
npx cap sync android
npx cap run android
```

The app will automatically initialize OneSignal and request notification permission on launch.

---

## Production Build

When ready to remove the dev server URL:
1. In `capacitor.config.ts`, remove the `server` block
2. Run `npm run build && npx cap sync android`
3. Build your APK/AAB in Android Studio: **Build → Generate Signed Bundle/APK**

## Further Reading
📖 [Lovable Mobile App Guide](https://docs.lovable.dev/tips/mobile-app)

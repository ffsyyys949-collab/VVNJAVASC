# VNJAVA

Aplikasi super-app berbasis React, TypeScript, Express, WebSocket, dan Capacitor Android dengan ekosistem sosial, AI companion, VN Music Player (full audio streaming + offline IndexedDB + TikTok audio background), TikTok Downloader tanpa watermark, serta game **Stickman War** 2D canvas real-time.

---

## Fitur Utama

- **Akun, Komunitas & Chat Real-Time**: Registrasi, login persistent + refresh token otomatis, pencarian pengguna (`/api/users/search`), chat & panggilan WebSocket, Story 24 jam, dan Panel Owner.
- **VN Music Global & Offline**:
  - Katalog lagu global gabungan (iTunes, Deezer, Jamendo, Audius, MusicBrainz + YouTube full matching) dengan infinite scroll.
  - Full-duration playback (resolusi multi-sumber dengan seleksi selisih durasi terkecil, bukan terpotong 30 detik), slider seek maju/mundur, slider kecepatan putar (`0.5x`–`2.0x`), dan unduh lagu offline di browser/APK via IndexedDB.
  - Integrasi langsung link TikTok sebagai background music & video banner Beranda.
- **TikTok Downloader (No Watermark & MP3)**:
  - Mengurai tautan pendek (`vt.tiktok.com` / `vm.tiktok.com`) via HTTP redirect sebelum memanggil 5 server fallback berurutan.
  - Embedded `<video>` preview player, unduh HD MP4 No Watermark, dan unduh Audio MP3 via proxy `/api/tiktok/download`.
- **AI Companion (zeya)**:
  - Dukungan Custom Prompt prioritas #1, toggle Mode Dewasa 18+, serta multi-engine AI dengan sinkronisasi pengaturan ke server.
- **Stickman War**:
  - Lobby 3-kolom responsif landscape/portrait, karakter & skin senjata, Upgrade, Shop (beli senjata & tukar Diamond ke Koin), Gacha dengan sistem pity, Inventory, dan arena pertarungan Canvas 60fps (Duel vs AI & Arena PVP).

---

## Persyaratan Sistem

- **Node.js** `>= 20.x` dan **npm** `>= 10.x`
- *(Opsional Android APK)* **JDK 17+**, **Android SDK**, dan Gradle (`./android/gradlew`)

---

## Instalasi & Menjalankan Secara Lokal

1. **Clone repository dan install dependencies:**
   ```bash
   git clone <URL_REPO_GITHUB_ANDA>
   cd <NAMA_FOLDER_REPO>
   npm install
   ```

2. **Siapkan environment variable:**
   ```bash
   cp .env.example .env
   ```
   Isi `.env` sesuai kebutuhan (lihat bagian **Konfigurasi Environment** di bawah). Jangan pernah commit file `.env` ke GitHub.

3. **Jalankan mode development (Frontend Vite + Backend Express di port 3000):**
   ```bash
   npm run dev
   ```
   Buka browser ke `http://localhost:3000`.

4. **Build & jalankan mode production:**
   ```bash
   npm run build
   npm start
   ```

---

## Konfigurasi Environment (`.env.example`)

| Variable | Wajib | Keterangan |
| :--- | :---: | :--- |
| `GROQ_API_KEY` | Opsional | Kunci API Groq untuk AI Companion (`llama-3.3-70b-versatile`). Jika kosong, fallback teks otomatis tetap tersedia. |
| `APP_URL` | Opsional | URL publik server backend (digunakan untuk CORS & deep link APK). |
| `ZEIO_AUTH_SECRET` | Opsional | Secret HMAC-SHA256 server untuk token & refresh token. Jika kosong, server otomatis membuat kunci acak yang aman di disk. |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Opsional | Jika ingin mirroring database & media ke Supabase PostgreSQL + Storage. |
| `MIDTRANS_SERVER_KEY`, `MIDTRANS_IS_PRODUCTION` | Opsional | Gateway QRIS real untuk transaksi TOPUP. |
| `ELEVENLABS_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY` | Opsional | Engine suara & AI tambahan di sisi server. |

---

## Build Android APK (Capacitor)

```bash
npm run build:apk
cd android
./gradlew assembleDebug
```
Output APK berada di `android/app/build/outputs/apk/debug/app-debug.apk`.
Pastikan URL backend produksi telah dikonfigurasi jika menjalankan APK pada perangkat fisik agar WebView APK terhubung ke server API Anda.

---

## Struktur Proyek

```
├── server.ts                  # Server Express + WebSocket + API Musik, TikTok, AI & Stickman
├── server/
│   ├── featuresEngine.ts      # Token/Refresh Token HMAC, Upload, Story, & AI Settings Engine
│   └── stickmanEngine.ts      # Server-authoritative Stickman War (Koin, Gacha, Shop, Inventory)
├── src/
│   ├── App.tsx                # Aplikasi utama, navigasi, Auth, Beranda, Chat & Bottom Bar
│   ├── contexts/
│   │   ├── MusicContext.tsx   # Global Audio/YouTube Player, Seek & Speed Sliders, Offline Playback
│   │   └── homeUiConfig.ts    # Tema dan konfigurasi tampilan Beranda
│   ├── lib/
│   │   ├── apiBase.ts         # Resolusi base URL Web/APK & penyimpanan Token/Refresh Token
│   │   ├── zeDataSync.ts      # safeApiFetch (auto-refresh 401), TikTok resolver & media downloader
│   │   └── offlineMusicDb.ts  # Penyimpanan audio full offline berbasis IndexedDB
│   └── components/
│       ├── MusicLabPage.tsx           # Katalog musik global 100.000+ & pengaturan VN Music
│       ├── TikTokDownloaderPage.tsx   # Downloader TikTok No WM + video preview + audio MP3
│       ├── AiACompanion.tsx           # Companion AI (Custom Prompt & 18+)
│       ├── OwnerDashboardModal.tsx    # Dashboard Owner
│       └── stickman/                  # Stickman War Lobby, Shop, Gacha, Upgrade & Arena
└── android/                   # Proyek native Android Capacitor
```

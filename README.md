# 💬 MultiChatStream

> **Modern Aesthetic Multi-Platform Live Stream Chat Overlay**  
> Agregator live chat streaming real-time untuk **YouTube**, **Twitch**, **TikTok LIVE**, dan **Discord** dengan antarmuka modern bertema kapsul pastel (*Figma Pill Theme*), mode transparan mengambang (*Always on Top*), fitur **Collab Stream** (membaca chat partner bersamaan), engine emoji HD & stiker animasi, sistem alert donasi/medser, serta konektor TikTok **100% GRATIS** tanpa layanan berbayar pihak ketiga.

---

## ✨ Fitur Unggulan

### 1. 📺 Multi-Platform Chat Aggregation (4-in-1)
- **YouTube LIVE**:
  - Deteksi otomatis (*smart resolver*) siaran langsung melalui Handle channel (contoh: `@StreamerName`), Channel ID (`UC...`), atau Video ID live.
  - Mendukung pesan teks, emoji custom channel, **Super Chat** 💸, **Super Sticker** 🌟, dan notifikasi **Membership** 🎖️.
- **Twitch**:
  - Koneksi cepat dan stabil via WebSocket IRC resmi Twitch.
  - Mendukung Twitch emotes global, sub emotes, dan format teks real-time.
- **TikTok LIVE (100% Free - No Paid Plans / No EulerStream)**:
  - Mengambil komentar penonton, gifts saweran, dan emote langsung via Chromium background session & interceptor WebSocket native (CDP).
  - **Bebas biaya selamanya**: Tanpa langganan bulanan EulerStream, tanpa limit token, dan tanpa API key pihak ketiga.
  - Dilengkapi sistem proteksi anti double-chat deduplication cache.
- **Discord Channel Chat**:
  - Terhubung langsung ke channel teks Discord server Anda via **Discord WebSocket Gateway v10**.
  - Mendukung emoji kustom Discord statis (`<:name:id>`) & animasi GIF (`<a:name:id>`), lampiran gambar (*attachments*), dan stiker server.

### 2. 🤝 Collab Stream (Multi-Chat Partner Aggregator)
- **Tambah Lebih dari 1 Stream Bersamaan**:
  - Ingin live bareng teman atau sesama streamer (*collab streaming*)? Tambahkan live chat partner Anda melalui menu **Pengaturan > Stream > ➕ Add More Stream**.
  - Mendukung penambahan stream partner dari semua platform (YouTube, Twitch, TikTok, Discord).
- **Badge Visual Khusus**:
  - Setiap pesan dari channel partner secara otomatis diberi tanda badge pembeda yang elegan (contoh: `[🤝 PartnerName]`) agar Anda tahu dari channel mana chat tersebut berasal.

### 3. 🎨 Header Bertema Kapsul Pastel (Figma Pill Design)
- **Desain Modern & Mudah Digeser**:
  - Header berdesain kapsul memanjang (*pill capsule*) dengan warna pastel coral `#ff9c9e`, border hitam presisi 1px, dan font tebal **K2D Bold**.
  - Logo `multichat` (hitam bergaris putih) dan `stream` (merah bergaris putih) dengan indikator status online bulat hijau.
  - **Leluasa Digeser**: Seluruh area logo dan latar belakang header dapat langsung diklik dan diseret (*draggable*) dengan mudah (`cursor: grab`).
  - Tombol Pengaturan dan Window Controls diselaraskan dengan bentuk kapsul dan kotak berwarna biru pastel `#9cb0ff`.

### 4. ⚙️ Panel Pengaturan Berdampingan (Side-by-Side Docking)
- **Live Preview Sambil Mengatur**:
  - Panel Pengaturan membuka rapi di **sebelah kanan kolom chat** secara berdampingan (*side-by-side*), sehingga Anda dapat langsung melihat perubahan warna, font, dan animasi secara *real-time*.
  - **Ekspansi Window Otomatis**: Window aplikasi otomatis bertambah lebar ke kanan sebesar `370px` saat pengaturan dibuka, dan mengecil kembali ke ukuran awal saat ditutup tanpa merusak ukuran overlay ramping Anda.

### 5. 📜 Fitur Auto-Scroll Pintar & Tombol Melayang
- **Gulir Otomatis**: Setiap ada chat baru masuk, layar chat akan otomatis bergulir ke baris paling bawah.
- **Deteksi Baca Riwayat**: Jika Anda menggulir ke atas untuk membaca pesan lama, auto-scroll dijeda sementara dan muncul tombol melayang **`⬇ Pesan Baru di Bawah`**.
- **Terlindungi Saat Buka Pengaturan**: Perubahan ukuran jendela saat membuka/menutup menu pengaturan tidak akan mematikan auto-scroll.
- **Saklar Pengaturan**: Dapat dinyalakan atau dimatikan kapan saja di **Pengaturan > Kontrol**.

### 6. 🎨 Floating Overlay & Glassmorphism Design
- **Mode Transparan & Efek Kaca**:
  - Menghilangkan latar belakang jendela secara total (*fully transparent*) sehingga hanya menampilkan gelembung chat (*bubble chat*) yang melayang elegan di atas game atau desktop Anda.
  - Preset tampilan: *Transparan*, *Kaca Gelap (Glassmorphism)*, *Hitam Pekat*, dan *Green Screen* (untuk chroma key OBS).
  - Kustomisasi penuh warna latar, opasitas gelembung chat, radius sudut (*border radius*), border halus, dan jarak antar pesan.
  - Pilihan tipografi modern: **Inter**, **Poppins**, **Outfit**, **Roboto**, **K2D**, **Share Tech Mono**, dan **VT323 (Pixel Retro)**.

### 7. 🔒 Lock Position (Lock Orientation) & Always on Top
- **Icon Vektor SVG Padlock**: Menggunakan ikon SVG dengan animasi shackle dinamis untuk membedakan status terkunci dan terbuka.
- **Kunci Posisi**: Mengunci posisi jendela chat agar tidak dapat tergeser atau terpindah tanpa sengaja saat Anda sedang fokus streaming atau bermain game (bebas bug perubahan ukuran pada Windows 11 DWM).
- **Always on Top**: Memastikan jendela chat selalu tampil di baris terdepan dan tidak tertutup saat Anda berpindah jendela atau melakukan `ALT + TAB`.

### 8. 🔄 Instant Chat Refresh & Pinned Drawer (Icon Vektor SVG)
- **Tombol SVG Refresh Halus**: Ikon panah ganda SVG modern dengan animasi rotasi putar mulus saat diklik untuk menyegarkan koneksi stream dan membersihkan cache.
- **Ikon SVG Pin & Pinned Messages Drawer**: Tombol pushpin SVG berderajat miring elegan untuk membuka drawer riwayat pesan tersemat (pinned messages).

### 9. 🔑 Simpan Akun & Auto-Connect Permanen
- Simpan akun Twitch, YouTube, TikTok, dan Discord Anda satu kali.
- Konfigurasi tersimpan secara permanen di storage lokal disk (`%APPDATA%\MultiChatStream\settings.json`) sehingga akun Anda tidak akan hilang meskipun aplikasi ditutup atau komputer direstart.
- **Auto-Connect**: Saat aplikasi dibuka, MultiChatStream akan langsung memantau dan menghubungkan channel live Anda secara otomatis.

### 10. 😀 Engine Emoji, Emote & Stiker HD
- Konversi otomatis Unicode emoji menjadi Twemoji SVG beresolusi tinggi.
- Parsing native untuk emote custom YouTube, stiker YouTube Super Sticker, emote TikTok, dan Twitch emotes (`PogChamp`, `Kappa`, `LUL`, `monkaS`, dll.).
- Dukungan penuh custom emoji Discord (termasuk emoji animasi GIF) dan stiker Discord.

### 11. 🎁 Live Alert Donasi Real-Time (Tako, Saweria, Sociabuzz & Trakteer)
- **Live Transparent Iframe Overlay**: Memuat URL Browser Source / Alert Overlay Tako (`https://tako.id/overlay/...`) dan Saweria langsung di atas area chat secara transparan tanpa menghalangi klik maupun scroll mouse penonton (`pointer-events: none`).
- **Autoplay Audio Alerts**: Dilengkapi izin `autoplayPolicy: 'no-user-gesture-required'` sehingga efek suara notifikasi donasi Tako/Saweria langsung berbunyi otomatis saat ada donasi masuk atau saat dites dari dashboard.
- **Status Badge Real-Time & 1-Click Reload**: Indikator status koneksi `🟢 Aktif (Live)` dan tombol `🔄 Muat Ulang` untuk mereset overlay seketika.
- **Leaderboard Top Donatur Sesi Live**: Menampilkan ranking donatur teratas sesi live ini yang dapat diakses langsung melalui menu **Pengaturan > Donasi**.
- **Simulator & Tester**: Tersedia tombol uji coba simulasi donasi Saweria, Tako, Medser (Media Share), dan Leaderboard.

### 12. 🛡️ Kode Keamanan & Bebas SmartScreen
- Dilengkapi dengan sertifikat penandatanganan digital (*Code Signing Certificate*).
- Disertakan skrip instalasi 1-klik `Install-Certificate.bat` untuk mendaftarkan sertifikat ke Windows Trusted Root sehingga installer dan aplikasi berjalan mulus tanpa peringatan Windows Defender / SmartScreen.

---

## 📦 Hasil Rilis Aplikasi (.exe)

Aplikasi dibangun ke dalam 2 jenis format distribusi resmi:
1. **`multichatstream-installer.exe`** — File installer setup Windows berbasis NSIS (dilengkapi opsi shortcut desktop & menu start).
2. **`multichatstream-portable.exe`** — Aplikasi mandiri portabel yang dapat langsung dijalankan dari USB flashdisk atau folder mana pun tanpa instalasi.

---

## 🚀 Panduan Memulai

### Prasyarat
- [Node.js](https://nodejs.org/) (versi 18 LTS ke atas disarankan)
- [Git](https://git-scm.com/)

### 1. Kloning Repositori
```bash
git clone https://github.com/accdan/livechat-pro.git multichatstream
cd multichatstream
```

### 2. Instalasi Dependensi
```bash
npm install
```

### 3. Menjalankan Aplikasi
```bash
npm start
```
Atau klik ganda pada file `MultiChatStream.bat`.

---

## 🔨 Membangun File Executable (.exe)

Untuk memaketkan aplikasi menjadi file `.exe` siap pakai:

### Build Versi Portable:
```bash
npm run build:portable
```
Hasil file: `dist/multichatstream-portable.exe`

### Build Versi Installer:
```bash
npm run build:installer
```
Hasil file: `dist/multichatstream-installer.exe`

### Build Keduanya Sekaligus:
```bash
npm run build:all
```

---

## 🎮 Panduan Menghubungkan Platform

Buka menu **Settings (⚙️)** pada aplikasi:

### 👾 Twitch
1. Masukkan nama channel Twitch Anda (contoh: `ninja` atau channel Anda).
2. Chat akan otomatis tersambung via WebSocket IRC.

### ▶ YouTube
1. Masukkan Handle YouTube Anda (contoh: `@WindahBasudara`) atau Channel ID (`UC...`) atau Video ID langsung.
2. MultiChatStream akan secara otomatis mendeteksi ketika siaran langsung dimulai.

### 🎵 TikTok LIVE
1. Masukkan username akun TikTok Anda (contoh: `mpl.id.official` atau akun Anda).
2. Saat live stream aktif, komentar dan gift akan otomatis tampil di layar.

### 🎮 Discord
1. Buka [Discord Developer Portal](https://discord.com/developers/applications) dan buat aplikasi / bot baru.
2. Di menu **Bot**, klik **Reset Token** dan salin Token Bot tersebut.
3. Aktifkan toggle **MESSAGE CONTENT INTENT** di halaman Bot (wajib agar bot dapat membaca pesan chat).
4. Invite bot ke server Discord Anda dengan izin *Read Messages/View Channels*.
5. Di MultiChatStream, klik **Simpan** pada baris Discord, masukkan **Bot Token** dan **Channel ID** (klik kanan channel Discord > *Copy Channel ID*).

---

## 🛠️ Arsitektur & Teknologi

| Komponen | Teknologi |
|---|---|
| **Runtime Desktop** | [Electron](https://www.electronjs.org/) (Chromium + Node.js) |
| **Frontend UI** | HTML5 Semantic, Modern Vanilla CSS3, ES6+ JavaScript |
| **Penyimpanan Data** | Permanent JSON Storage (`%APPDATA%\MultiChatStream\settings.json`) + LocalStorage API |
| **Protokol Chat** | W3C WebSocket API, Twitch IRC, Discord Gateway v10, YouTube InnerTube Realtime Poller, Chromium CDP Interceptor |
| **Emoji Engine** | Twemoji SVG, Twitch Emotes CDN, Discord CDN, TikTok Webcast Emotes |
| **Security & Signing** | SHA-256 Authenticode Code Signing via Windows Certificate Store & PowerShell PKI |
| **Packaging & Builder** | `electron-builder` (Target NSIS & Portable) |

---

## 📄 Lisensi

Proyek ini dibuat untuk kebutuhan personal streaming dan komunitas live streamer multi-platform. Bebas dimodifikasi dan dikembangkan sesuai kebutuhan (*MIT License*).

# 📺 LiveChat Pro 95

> **Aesthetic Windows 95 Themed Multi-Platform Live Stream Chat Overlay**  
> Agregator live chat real-time untuk **YouTube**, **Twitch**, dan **TikTok LIVE** dengan tampilan retro Windows 95, mode transparan mengambang (*Always on Top*), engine emoji HD, dan konektor TikTok **100% GRATIS** tanpa layanan berbayar.

---

## ✨ Fitur Utama

- 🎨 **Desain Otentik Windows 95 & Mode Transparan**
  - Tampilan klasik retro ala Windows 95 lengkap dengan titlebar, taskbar, start button, dan dialog pop-up.
  - **Mode Transparan Penuh**: Menghilangkan seluruh latar belakang jendela sehingga hanya menampilkan gelembung chat (*bubble chat*) melayang di atas game atau desktop Anda.
  - Pengaturan warna latar kustom via color picker live.

- 📌 **Always on Top & Lock Position**
  - **Selalu di Paling Depan**: Layar chat tetap terlihat di atas jendela lain saat Anda bermain game atau melakukan `ALT + TAB`.
  - **Kunci Posisi (*Lock Orientation*)**: Mencegah jendela chat tergeser atau terpindah secara tidak sengaja saat interaksi berlangsung.

- 🎵 **TikTok LIVE Engine (100% Free - No Paid Plans / No EulerStream)**
  - Menghubungkan siaran langsung TikTok menggunakan sesi background Chromium & interseptor native WebSocket (CDP).
  - Mengambil komentar teks penonton, stiker/emote, dan gift saweran secara instan.
  - **Bebas biaya selamanya**: Tanpa langganan EulerStream, tanpa API key pihak ketiga, dan tanpa limit token.
  - Mendukung deteksi otomatis status online/offline dan standby retry.

- 📺 **Multi-Platform Chat Aggregation**
  - **Twitch**: Koneksi cepat via WebSocket IRC.
  - **YouTube LIVE**: Live chat poller dengan dukungan video ID atau live channel.
  - **TikTok LIVE**: Engine WebSocket decoding Protobuf native.
  - **Akun Streamer Tersimpan**: Fitur simpan akun memudahkan Anda untuk langsung auto-connect ke channel Anda tanpa perlu memasukkan link atau ID berulang kali.

- 😀 **Engine Emoji & Emote HD**
  - Konversi otomatis simbol dan kode emoji menjadi Twemoji SVG beresolusi tinggi.
  - Dukungan Twitch Emotes populer (`PogChamp`, `Kappa`, `LUL`, `monkaS`, dll.).
  - Dukungan shortcode emoji standar (`:fire:`, `:heart:`, `:sob:`, `:rocket:`, dll.).

- ⚙️ **Panel Pengaturan Interaktif di Sisi Kanan**
  - Panel konfigurasi muncul di sebelah kanan jendela chat (*docked pop-up*), memungkinkan Anda melihat perubahan tema, warna, ukuran font, dan ukuran gelembung secara langsung (*live preview*).

- 📦 **Aplikasi Portabel Mandiri (.exe)**
  - Dapat dijalankan langsung tanpa installasi Node.js melalui single-file portable executable.

---

## 🚀 Memulai (Instalasi & Menjalankan)

### Prasyarat
- [Node.js](https://nodejs.org/) (versi 18 ke atas disarankan)
- [Git](https://git-scm.com/)

### 1. Kloning Repositori
```bash
git clone https://github.com/accdan/livechat-pro.git
cd livechat-pro
```

### 2. Instalasi Dependensi
```bash
npm install
```

### 3. Menjalankan dalam Mode Pengembang
```bash
npm start
```
Atau klik ganda pada file `LiveChatPro95.bat`.

---

## 🔨 Membangun Aplikasi Portable (.exe)

Untuk membuat file `.exe` portabel siap pakai yang tidak memerlukan Node.js di komputer pengguna:

```bash
npm run build:portable
```

File hasil build akan berada di direktori:
```
dist/LiveChatPro-Portable.exe
```

---

## 🎮 Cara Menghubungkan Stream

1. Buka aplikasi **LiveChat Pro**.
2. Buka menu **Setting** (ikon roda gigi di pojok kanan bawah atau melalui Start Menu).
3. Pilih tab **Stream**:
   - **Twitch**: Masukkan username channel Twitch (contoh: `ninja` atau channel Anda).
   - **YouTube**: Masukkan Video ID atau URL live stream YouTube Anda.
   - **TikTok**: Masukkan username TikTok (contoh: `@mpl.id.official` atau akun Anda).
4. Klik tombol **Hubungkan** / **Connect**. Chat akan otomatis tampil di layar.

---

## 🛠️ Teknologi yang Digunakan

- **Runtime:** [Electron](https://www.electronjs.org/)
- **Frontend:** Vanilla HTML5, CSS3, & Modern JavaScript (ES Modules)
- **Protocol:** Chrome DevTools Protocol (CDP) WebSocket Interceptor, Twemoji
- **Bundler / Packager:** `electron-builder`

---

## 📄 Lisensi

Proyek ini dibuat untuk kebutuhan personal streaming & komunitas live streamer. Bebas dimodifikasi dan dikembangkan sesuai kebutuhan.

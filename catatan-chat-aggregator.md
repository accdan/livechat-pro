# Catatan Proyek: Multi-Platform Livestream Chat Aggregator

## 1. Ide & Tujuan
Aplikasi desktop popup yang mengambil chat livestream dari **YouTube, TikTok, dan Twitch** secara bersamaan, lalu menampilkannya dalam satu layar chat. Ditujukan untuk streamer yang siaran di 3 platform sekaligus (multistreaming), supaya tidak perlu buka 3 tab/jendela chat terpisah.

## 2. Keputusan Teknis

| Aspek | Keputusan |
|---|---|
| Bentuk aplikasi | Desktop app, window terpisah |
| Output akhir | File `.exe` (Windows), ringan & rendah resource |
| Framework | **Tauri** (Rust backend + web frontend) |
| Tema UI | Retro/komputer lama, **hitam-putih murni** (bukan grayscale) |

### Kenapa Tauri
- Ukuran `.exe` bisa 3–10MB (pakai WebView2 bawaan Windows, bukan bundle browser sendiri seperti Electron)
- RAM idle sekitar 30–50MB
- Frontend tetap HTML/CSS/JS biasa — cukup familiar
- Trade-off: backend logic ditulis di Rust, ada learning curve

## 3. Strategi Integrasi per Platform

### YouTube — jalur resmi
- Pakai **YouTube Live Streaming API**, endpoint `liveChatMessages.list`
- Polling tiap beberapa detik dari Rust pakai crate `reqwest`

### Twitch — jalur resmi (IRC)
- Chat Twitch berjalan di atas protokol IRC
- Pakai crate Rust `twitch-irc` untuk connect dan menerima event pesan langsung
- Ini yang paling mudah diimplementasikan

### TikTok — tidak ada API resmi
- TikTok tidak menyediakan API publik untuk live chat sama sekali
- Semua library yang ada (termasuk `TikTokLive` di Python) adalah hasil *reverse-engineering* terhadap websocket internal TikTok
- Library Python `TikTokLive` adalah yang paling matang dan aktif di-maintain — ekosistem Rust maupun Dart/Flutter jauh lebih lemah untuk kasus ini, sehingga pindah framework tidak menyelesaikan masalah ini
- **Solusi**: jalankan `TikTokLive` (Python) sebagai **proses sidecar** terpisah dari aplikasi utama
  - Sidecar bertugas connect ke TikTok dan print event chat ke stdout dalam format JSON per baris
  - Tauri (Rust) men-spawn proses sidecar ini, membaca stdout-nya, lalu forward datanya ke frontend
  - Risiko: karena tidak resmi, library ini bisa rusak sewaktu-waktu jika TikTok mengubah struktur internal mereka

### Menyatukan data
- Event dari ketiga sumber di-emit ke frontend lewat `window.emit()` (Tauri)
- Frontend `listen()` event tersebut dan render ke dalam satu list chat gabungan
- Format standar per pesan: nama platform, nama pengirim, isi pesan, timestamp

## 4. Struktur Project (usulan)

```
chat-aggregator/
├── src/                    # Frontend (HTML/CSS/JS)
│   ├── index.html
│   ├── main.js             # render chat masuk ke DOM
│   └── style.css           # tema retro hitam-putih
├── src-tauri/
│   ├── src/
│   │   ├── main.rs         # entry point, spawn sidecar, emit event
│   │   ├── youtube.rs      # polling YouTube Live Chat API
│   │   ├── twitch.rs       # IRC client ke Twitch chat
│   │   └── tiktok_bridge.rs # baca stdout dari sidecar Python
│   └── Cargo.toml
└── sidecar/
    └── tiktok_listener.py  # pakai library TikTokLive, print JSON per baris
```

## 5. Arahan Desain UI (Retro Windows 95)

- **Warna & Palet**: Classic Windows 95 Gray (`#C0C0C0`), Titlebar Navy (`#000080` -> `#1084D0`), Window Inset Background (`#FFFFFF` atau `#000000` High Contrast mode).
- **Border & 3D Bevel**: Border 3D khas Win95 dengan efek raised (`outset`) untuk tombol/window dan sunken (`inset`) untuk text field/chat display.
- **Font**: Monospace / Retro Sans — `MS Sans Serif`, `Tahoma`, `VT323`, atau `Courier New`.
- **Elemen UI**: Titlebar lengkap dengan ikon app, tombol Minimize, Maximize, Close (`X`), Menu Bar classic (`File`, `Streams`, `View`, `Options`, `Help`), Toolbar ikon 3D, dan Status Bar di bagian bawah.
- **Tag Platform**: Badge bergaya Win95 `[YT]` untuk YouTube dan `[TW]` untuk Twitch.
- **Efek Retro**: Efek suara beep/click retro Win95 via Web Audio API, serta opsional filter CRT scanlines.

## 6. Integrasi via Stream URL Direct
- Pengguna dapat menempelkan URL YouTube (`https://www.youtube.com/watch?v=...` atau `https://youtube.com/live/...`) atau URL Twitch (`https://www.twitch.tv/username`).
- Aplikasi mengurai URL secara otomatis untuk mendeteksi ID stream atau nama channel Twitch, kemudian membuka koneksi chat real-time.
- TikTok ditunda untuk pengembangan versi mendatang.

## 7. Langkah Kerja
1. Bangun antarmuka desktop Windows 95 (`index.html` & `style.css`).
2. Implementasikan engine URL parser & WebSocket Twitch IRC client (`app.js`).
3. Implementasikan YouTube chat stream handler & mode simulasi stream untuk testing.
4. Tambahkan fitur filter, pencarian kata kunci, pin pesan, ekspor log chat, dan efek suara retro.
5. Uji koneksi live stream chat dan verifikasi UI Win95.


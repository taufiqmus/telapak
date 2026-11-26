# Telapak

Tenis meja di browser. Tanganmu yang memukul: kamera laptop membaca telapak tangan lewat MediaPipe Pose, lalu menggerakkan bat 3D. Bisa juga dimainkan dengan mouse atau layar sentuh.

Main langsung: https://taufiqmus.github.io/telapak/

## Mode

| Mode | Isi |
|---|---|
| Tutorial | 5 langkah: gerakkan bat, pukul bola, kembalikan 3 bola, topspin, pukulan keras |
| Latihan | Mesin bola melempar terus. Skor kiri = bola masuk, kanan = gagal |
| Lawan komputer | Tanding cepat, level Mudah/Sedang/Sulit |
| Karier | 5 lawan bergaya beda (tembok, pemutar, penyerang, cepat, juara), terbuka berurutan |
| Berdua, satu kamera | Dua orang di depan satu laptop, layar terbelah |
| Buat room / Gabung | Duel dua laptop lewat WebRTC (PeerJS) |

## Teknik pukulan

- **Arah**: posisi bat dan kemiringan telapak menentukan arah bola.
- **Kekuatan**: kecepatan ayun. Ayunan cepat = bola lebih dalam.
- **Spin**: ayun ke atas saat memukul = topspin (bola menukik, pantulan melesat, jejak merah). Ayun ke bawah = backspin (jejak biru).
- **Smash**: ayunan sangat cepat (di atas 3,2 m/s) ke bola yang tinggi.

Saat bola lolos, layar memberi tahu sebabnya: bat terlalu kiri/kanan/tinggi/rendah, bola nyangkut net, atau keluar meja.

## Menjalankan di laptop sendiri

ES module tidak jalan dari `file://`, jadi buka lewat server lokal:

```sh
npm run dev        # http://127.0.0.1:8080
npm test           # tes fisika, aturan skor, dan penyimpanan
```

Kamera hanya jalan di `localhost` atau HTTPS.

## Struktur

| Berkas | Isi |
|---|---|
| `js/physics.js` | Fisika bola, spin, aturan skor, pemetaan tangan ke bat. Murni, diuji di `test/` |
| `js/pose.js` | Kamera, MediaPipe Pose, One Euro filter, kalibrasi per pemain |
| `js/cpu.js` | Lawan komputer dan profil karier |
| `js/scene.js` | Three.js: arena, efek, layar terbelah, kamera tayangan ulang |
| `js/net.js` | Room PeerJS |
| `js/main.js` | Menu, mode, loop utama, netcode tamu, tutorial, statistik |
| `js/audio.js` | Suara sintetis |
| `js/store.js` | Statistik, pencapaian, kemajuan karier (localStorage) |
| `sw.js` | Service worker: offline setelah sekali dimuat |

## Duel dua laptop

Host menghitung fisika dan skor. Tamu memprediksi bola sendiri dan menilai pukulannya sendiri, lalu host memvalidasinya (pemukul diuntungkan, supaya lag tidak membuat tamu "tembus"). Halaman versi lama tidak bisa masuk ke room versi ini: awalan id room dan versi protokol berbeda.

## Menyetel hitbox dari data nyata

Setiap pukulan kena dan meleset dicatat (jarak bola ke bat) di laptop pemain. Setelah beberapa sesi bermain dengan kamera, buka konsol browser dan ketik `telapakLog()` untuk mengekspor datanya. Data ini dipakai untuk menyetel `HIT` dan jendela waktu di `js/physics.js`.

## Uji otomatis

`?debug` di URL membuka `window.__telapak` (keadaan permainan) untuk skrip uji di browser.

## Rilis

GitHub Pages menyajikan cabang `main`. Saat mengubah daftar file di `sw.js`, naikkan nama `CACHE`.

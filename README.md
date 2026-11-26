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
- **Forehand dan backhand**: bat di sisi tangan pemukul = forehand (karet merah ke net), bat menyilang ke sisi lain = backhand (karet hitam ke net, lengan menyilang badan). Pilihan "Tangan" di pengaturan menentukan sisi pemukul. `telapakLog()` mencatat `bh` per pukulan untuk menyetel backhand.
- **Kekuatan**: kecepatan ayun. Ayunan cepat = bola lebih dalam.
- **Servis**: pegang bola dengan tangan bebas di depan dada, lalu angkat cepat ke atas untuk melempar (minimal 16 cm; di setelan Realistis lemparan yang terlalu rendah = poin hilang). Pukul saat bola turun. Tanpa tangan bebas yang terlihat (mode mouse, berdua satu kamera, atau tangan di luar gambar 2,5 detik) bola dilempar otomatis. Servis harus memantul dulu di meja sendiri, lalu di meja lawan (bantuan pukulan mengarahkannya). Lemparan yang tidak terpukul dilempar ulang, kecuali di setelan Realistis (poin hilang).
- **Tanpa volley**: bola baru bisa dipukul setelah memantul di meja sendiri. Bola panjang yang belum memantul dibiarkan saja: kalau keluar, poin untukmu.
- **Bantuan pukulan** (pengaturan): Penuh = bola selalu masuk; Normal (sekitar 1 dari 18 pukulan gagal) dan Realistis (sekitar 1 dari 9) = kontak di luar tengah bat, ayunan terlalu keras, arah terlalu ke pinggir, dan spin lawan yang tidak dilawan bisa membuat bola keluar, melebar, atau masuk net. Topspin lawan diredam dengan ayunan datar ke depan (atau bilah menutup), backspin diangkat dengan ayunan dari bawah ke atas. Pesan poin menyebut penyebabnya. Bola di bawah tengah bat jadi rendah (net atau meja sendiri), di atas jadi panjang (keluar), di samping jadi melebar. Ayunan keras pada bola yang tidak tinggi: bilah menutup ke net, membuka keluar. Galatnya tidak acak, jadi bisa dipelajari dan sama di kedua laptop duel. Tutorial selalu Penuh.
- **Lawan komputer** bermain seperti manusia: bereaksi terlambat, menebak arah bola dengan galat (makin besar untuk bola cepat dan berputar), bergerak dengan percepatan terbatas, kembali ke posisi siap, backhand lebih lemah, salah membaca spin, dan goyah di reli panjang atau poin penentu. Ia juga bisa salah pukul. Tiap lawan karier punya kelemahan yang ditampilkan saat kamu kalah. Keseimbangan dicek dengan simulasi pertandingan tanpa layar (`test/sim.js`).
- **Lob**: bat jauh di belakang lalu ayun ke atas, bola melambung tinggi dan dalam (lawan bisa smash). **Drop shot**: sentuhan sangat pelan dengan bat dekat meja, bola pendek dengan backspin.
- **Sidespin**: ayunan menyamping membuat bola membelok di udara dan menendang ke samping setelah memantul.
- **Net dan tepi meja**: bola yang menyerempet pita net melambat lalu jatuh di sisi lawan, atau balik ke sisi pemukul bila serempetannya tebal. Servis yang menyerempet net lalu masuk = let (diulang tanpa poin). Bola yang mendarat di tepi meja sah dan memantul sangat rendah.
- **Kalibrasi lengkap** (menu Jeda atau tombol L): game memandu 7 posisi bat (siap, kanan, kiri, atas, bawah, depan, belakang) lalu memetakan jangkauanmu sendiri ke seluruh meja. Tersimpan per tangan di laptop ini dan dipakai otomatis. Gerak yang terlalu sempit memakai rentang bawaan. Mode berdua selalu memakai bawaan.
- **Sudut pandang ikut kepala** (pengaturan, aktif bawaan): condong kiri-kanan atau merunduk menggeser kamera orang pertama, dibaca dari hidung, mata, dan telinga dengan lebar bahu sebagai penggaris. Bat ikut bergeser bersama pandangan, jadi bola yang terlihat tertutup bat tetap dihitung kena.
- **Pitch bat** (pengaturan, eksperimental): condongkan jari ke arah layar untuk menutup bilah (bola rendah, pendek, topspin), tarik ke belakang untuk membuka (bola melambung, dalam, backspin). Dibaca dari telapak, jadi menjangkau ke depan tidak mengubah pitch. `telapakLog()` mencatat `p` per pukulan.
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

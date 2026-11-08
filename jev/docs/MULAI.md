# Mulai dari nol

*Untuk yang belum pernah memakai tool seperti ini. Anda cukup mengetik satu perintah dan menjawab pertanyaan. Sisanya dikerjakan Claude.*

## Satu perintah

Buka Claude Code di folder `jev/`, lalu ketik:

```
/mulai
```

Claude memeriksa Anda sudah sampai mana, lalu mengerjakan **satu langkah** saja setiap giliran, dengan bahasa sederhana. Anda tidak perlu menghafal perintah lain. Kalau berhenti di tengah dan kembali besok, ketik `/mulai` lagi: ia melanjutkan dari tempat terakhir.

## Enam tahap

| Tahap | Apa yang terjadi | Yang Anda lakukan |
|---|---|---|
| 1. Persiapan | Memeriksa alat. Claude yang berpikir, jadi **tidak perlu kunci OpenRouter** | Hampir tidak ada. Di server cukup satu kunci Anthropic (`ANTHROPIC_API_KEY`) |
| 2. Profil | Membaca CV Anda dan menanyakan yang belum jelas | Mengirim CV (PDF) dan menjawab pertanyaan singkat |
| 3. Cari lowongan | Mencari di 32 board perusahaan, menyaring, dan mengurutkan | Melihat 10 teratas |
| 4. Latihan | Mengisi 3 form **tanpa mengirim** | Membaca jawabannya. Kalau ada yang salah, perbaikan dilakukan di profil |
| 5. Kirim satu | Mengisi satu lamaran sungguhan | Berkata "ya, kirim" atau tidak |
| 6. Otomatis (boleh dilewati) | Beberapa lamaran per hari tanpa Anda mengawasi | Memutuskan mau atau tidak, setelah membaca risikonya |

Tidak ada yang terkirim sebelum Anda berkata ya di tahap 5. Tahap 6 baru ditawarkan setelah tahap 5 berjalan baik.

## Melihat progres

- **Dashboard** (`/report`): lamaran terkirim hari ini, yang butuh Anda, dan status tiap lowongan. Di server, dashboard dibuka lewat SSH tunnel (lihat `docs/CLOUD.md`).
- **Telegram** (opsional): ringkasan harian dan pemberitahuan kalau ada form yang butuh Anda, langsung ke HP.
- `/status`: ringkasan singkat di chat.

## Beberapa hal yang perlu diketahui sejak awal

- **Profil adalah kebenaran Anda.** Yang ditulis di sana masuk ke setiap form. Tool tidak mengubah status kerja, pendidikan, atau tanggal agar cocok dengan form, jadi profil yang salah akan salah di semua form.
- **Biaya.** Claude yang memutuskan: sekitar 1,6 sen per lowongan yang dinilai dan sekitar 5 sen per form. Pencarian pertama menilai 100 sampai 150 lowongan (sekitar 2 dolar, harga API), pencarian berikutnya hanya yang baru. Di langganan Claude Code, ini memakai jatah paket, bukan tagihan. Ada batas harian untuk run otomatis (4 dolar).
- **Opsi lebih murah.** Kalau mau, pasang kunci OpenRouter (JEV): sekitar 1 sen per 10 lamaran dan probabilitasnya sungguhan. Tidak wajib.
- **Kunci tidak pernah ditempel di chat.** Kalau Anda menempelnya juga, hapus kunci itu dan buat yang baru.
- **Sebagian form tidak bisa diselesaikan tool.** CAPTCHA dan kode yang dikirim lewat email harus Anda selesaikan sendiri. Form itu masuk daftar "butuh Anda", lengkap dengan link-nya.
- **Banyak lowongan terikat satu negara.** Dari Indonesia, lowongan remote yang benar-benar terbuka untuk semua negara jumlahnya sedikit. Itu wajar dan bukan kesalahan tool.
- **Mengirim tanpa diawasi adalah keputusan Anda.** Sebagian employer melarang lamaran otomatis di syarat penggunaannya. Mulailah dengan 3 sampai 5 per hari.

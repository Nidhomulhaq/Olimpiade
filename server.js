const express = require('express');
const session = require('express-session');
const { PrismaClient } = require('@prisma/client');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const prisma = new PrismaClient();
const port = process.env.PORT || 3000;

app.set('view engine', 'ejs');
// Menambahkan __dirname agar Vercel tidak tersesat mencari folder
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Mencegah galat "Read-Only File System" di Vercel saat peladen dinyalakan
const direktoriUnggahan = './public/uploads';
try {
    if (!fs.existsSync(direktoriUnggahan)){
        fs.mkdirSync(direktoriUnggahan, { recursive: true });
    }
} catch (galat) {
    console.log("Vercel mode: Melewati pembuatan folder lokal.");
}

const penyimpanan = multer.diskStorage({
    destination: function (req, file, cb) {
        // Gunakan folder /tmp khusus di Vercel agar fitur unggah tidak galat
        const dir = process.env.VERCEL ? '/tmp' : './public/uploads';
        cb(null, dir)
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + path.extname(file.originalname))
    }
});
const unggah = multer({ storage: penyimpanan });

app.use(session({
    secret: 'kunci-rahasia-olimpiade',
    resave: false,
    saveUninitialized: false
}));

app.get('/', (req, res) => {
    res.render('login'); 
});

app.post('/masuk', async (req, res) => { 
    const email = req.body.email;
    const kataSandi = req.body.kata_sandi;

    try {
        const pengguna = await prisma.pengguna.findUnique({
            where: { email: email }
        });

        if (pengguna && pengguna.kata_sandi === kataSandi) {
            req.session.penggunaId = pengguna.id_pengguna;
            req.session.peran = pengguna.peran;
            req.session.nama = pengguna.nama_lengkap;

            if (pengguna.peran === 'panitia') {
                res.redirect('/dasbor-panitia');
            } else if (pengguna.peran === 'peserta') {
                res.redirect('/dasbor-peserta');
            }
        } else {
            res.send('<h1>Surel atau kata sandi salah. <a href="/">Kembali</a></h1>');
        }
    } catch (galat) {
        console.error(galat);
        res.send('<h1>Terjadi kesalahan pada peladen.</h1>');
    }
});

// --- RUTE PANITIA ---
app.get('/dasbor-panitia', (req, res) => {
    if (req.session.penggunaId && req.session.peran === 'panitia') {
        res.render('dasbor-panitia', { nama: req.session.nama });
    } else {
        res.redirect('/'); 
    }
});

app.get('/panitia/verifikasi', async (req, res) => {
    if (req.session.penggunaId && req.session.peran === 'panitia') {
        try {
            const daftarDokumen = await prisma.dokumenPendaftaran.findMany({
                include: { pengguna: true },
                orderBy: { id_dokumen: 'desc' }
            });
            res.render('verifikasi-panitia', { 
                nama: req.session.nama, 
                daftarDokumen: daftarDokumen 
            });
        } catch (galat) {
            console.error(galat);
            res.send('Terjadi kesalahan saat memuat data.');
        }
    } else {
        res.redirect('/'); 
    }
});

app.post('/panitia/verifikasi/:id_dokumen', async (req, res) => {
    if (req.session.penggunaId && req.session.peran === 'panitia') {
        const idDokumen = parseInt(req.params.id_dokumen);
        const aksi = req.body.aksi; 
        
        try {
            const dokumen = await prisma.dokumenPendaftaran.findUnique({ where: { id_dokumen: idDokumen }});
            
            if (aksi === 'terima') {
                await prisma.dokumenPendaftaran.update({
                    where: { id_dokumen: idDokumen },
                    data: { status_verifikasi: 'diterima' }
                });
                await prisma.pengguna.update({
                    where: { id_pengguna: dokumen.id_pengguna },
                    data: { status_tahapan: 'siap_ujian' }
                });
            } else if (aksi === 'tolak') {
                await prisma.dokumenPendaftaran.update({
                    where: { id_dokumen: idDokumen },
                    data: { status_verifikasi: 'ditolak' }
                });
                await prisma.pengguna.update({
                    where: { id_pengguna: dokumen.id_pengguna },
                    data: { status_tahapan: 'isi_data' }
                });
            }
            res.redirect('/panitia/verifikasi');
        } catch (galat) {
            console.error(galat);
            res.send('Terjadi kesalahan saat memproses verifikasi.');
        }
    } else {
        res.redirect('/');
    }
});

// Manajemen Soal
app.get('/panitia/soal', async (req, res) => {
    if (req.session.penggunaId && req.session.peran === 'panitia') {
        try {
            const daftarSoal = await prisma.soal.findMany({ orderBy: { id_soal: 'desc' } });
            res.render('manajemen-soal', { nama: req.session.nama, daftarSoal: daftarSoal });
        } catch (galat) {
            console.error(galat);
            res.send('Terjadi kesalahan saat memuat bank soal.');
        }
    } else {
        res.redirect('/');
    }
});

app.post('/panitia/soal/tambah', async (req, res) => {
    if (req.session.penggunaId && req.session.peran === 'panitia') {
        try {
            const { teks_soal, pilihan_a, pilihan_b, pilihan_c, pilihan_d, jawaban_benar } = req.body;
            await prisma.soal.create({
                data: { teks_soal, pilihan_a, pilihan_b, pilihan_c, pilihan_d, jawaban_benar }
            });
            res.redirect('/panitia/soal');
        } catch (galat) {
            console.error(galat);
            res.send('Terjadi kesalahan saat menyimpan soal baru.');
        }
    } else {
        res.redirect('/');
    }
});

app.post('/panitia/soal/hapus/:id_soal', async (req, res) => {
    if (req.session.penggunaId && req.session.peran === 'panitia') {
        const idSoal = parseInt(req.params.id_soal);
        try {
            await prisma.soal.delete({ where: { id_soal: idSoal } });
            res.redirect('/panitia/soal');
        } catch (galat) {
            console.error(galat);
            res.send('Terjadi kesalahan saat menghapus soal.');
        }
    } else {
        res.redirect('/');
    }
});

// Kendali Ujian & Pantauan Nilai (Panitia)
app.get('/panitia/ujian', async (req, res) => {
    if (req.session.penggunaId && req.session.peran === 'panitia') {
        try {
            const daftarHasil = await prisma.hasilUjian.findMany({
                include: { pengguna: true },
                orderBy: { id_hasil: 'desc' }
            });
            res.render('panitia-ujian', { nama: req.session.nama, daftarHasil: daftarHasil });
        } catch (galat) {
            console.error(galat);
            res.send('Terjadi kesalahan saat memuat data ujian.');
        }
    } else {
        res.redirect('/');
    }
});

// --- RUTE PESERTA ---
app.get('/dasbor-peserta', async (req, res) => {
    if (req.session.penggunaId && req.session.peran === 'peserta') {
        try {
            const pengguna = await prisma.pengguna.findUnique({
                where: { id_pengguna: req.session.penggunaId }
            });
            res.render('dasbor-peserta', { pengguna: pengguna });
        } catch (galat) {
            console.error(galat);
            res.send('Terjadi kesalahan pada peladen.');
        }
    } else {
        res.redirect('/');
    }
});

app.post('/peserta/unggah', unggah.fields([{ name: 'berkas_identitas', maxCount: 1 }, { name: 'bukti_pembayaran', maxCount: 1 }]), async (req, res) => {
    if (req.session.penggunaId && req.session.peran === 'peserta') {
        try {
            const idPengguna = req.session.penggunaId;
            const asalSekolah = req.body.asal_sekolah;
            const berkasIdentitas = req.files['berkas_identitas'][0].filename;
            const buktiPembayaran = req.files['bukti_pembayaran'][0].filename;

            await prisma.dokumenPendaftaran.upsert({
                where: { id_pengguna: idPengguna },
                update: { asal_sekolah, berkas_identitas, bukti_pembayaran, status_verifikasi: 'menunggu' },
                create: { id_pengguna: idPengguna, asal_sekolah, berkas_identitas, bukti_pembayaran, status_verifikasi: 'menunggu' }
            });

            await prisma.pengguna.update({
                where: { id_pengguna: idPengguna },
                data: { status_tahapan: 'menunggu_verifikasi' }
            });

            res.redirect('/dasbor-peserta');
        } catch (galat) {
            console.error(galat);
            res.send('Terjadi kesalahan saat mengunggah dokumen.');
        }
    } else {
        res.redirect('/');
    }
});

// --- RUANG UJIAN PESERTA ---
app.get('/peserta/ujian', async (req, res) => {
    if (req.session.penggunaId && req.session.peran === 'peserta') {
        try {
            const pengguna = await prisma.pengguna.findUnique({
                where: { id_pengguna: req.session.penggunaId }
            });

            if (pengguna.status_tahapan !== 'siap_ujian') {
                return res.redirect('/dasbor-peserta');
            }

            let hasilUjian = await prisma.hasilUjian.findUnique({
                where: { id_pengguna: req.session.penggunaId }
            });

            if (!hasilUjian) {
                hasilUjian = await prisma.hasilUjian.create({
                    data: {
                        id_pengguna: req.session.penggunaId,
                        status_ujian: 'sedang_dikerjakan'
                    }
                });
            }

            if (hasilUjian.status_ujian === 'selesai') {
                return res.send('<h1>Ujian Anda telah selesai dikumpulkan. Terima kasih.</h1><a href="/keluar">Keluar</a>');
            }

            const daftarSoal = await prisma.soal.findMany();
            let jawabanTersimpan = {};
            if (hasilUjian.jawaban_peserta) {
                try { jawabanTersimpan = JSON.parse(hasilUjian.jawaban_peserta); } catch(e){}
            }

            res.render('ruang-ujian', { 
                pengguna: pengguna, 
                daftarSoal: daftarSoal, 
                jawabanTersimpan: jawabanTersimpan,
                jumlahPelanggaran: hasilUjian.jumlah_pelanggaran 
            });
        } catch (galat) {
            console.error(galat);
            res.send('Terjadi kesalahan saat membuka ruang ujian.');
        }
    } else {
        res.redirect('/');
    }
});

app.post('/peserta/ujian/autosave', async (req, res) => {
    if (req.session.penggunaId && req.session.peran === 'peserta') {
        try {
            const jawabanObj = req.body.jawaban;
            await prisma.hasilUjian.update({
                where: { id_pengguna: req.session.penggunaId },
                data: { jawaban_peserta: JSON.stringify(jawabanObj) }
            });
            res.json({ status: 'sukses' });
        } catch (galat) {
            res.status(500).json({ status: 'gagal' });
        }
    } else {
        res.status(403).json({ status: 'ditolak' });
    }
});

app.post('/peserta/ujian/pelanggaran', async (req, res) => {
    if (req.session.penggunaId && req.session.peran === 'peserta') {
        try {
            const hasil = await prisma.hasilUjian.findUnique({
                where: { id_pengguna: req.session.penggunaId }
            });
            
            const pelanggaranBaru = hasil.jumlah_pelanggaran + 1;
            let statusUjianBaru = 'sedang_dikerjakan';

            if (pelanggaranBaru >= 3) {
                statusUjianBaru = 'selesai'; 
            }

            await prisma.hasilUjian.update({
                where: { id_pengguna: req.session.penggunaId },
                data: { 
                    jumlah_pelanggaran: pelanggaranBaru,
                    status_ujian: statusUjianBaru
                }
            });

            res.json({ totalPelanggaran: pelanggaranBaru, dihentikan: pelanggaranBaru >= 3 });
        } catch (galat) {
            res.status(500).json({ status: 'gagal' });
        }
    } else {
        res.status(403).json({ status: 'ditolak' });
    }
});

app.post('/peserta/ujian/selesai', async (req, res) => {
    if (req.session.penggunaId && req.session.peran === 'peserta') {
        try {
            const idPengguna = req.session.penggunaId;
            const jawabanObj = req.body.jawaban || {};

            const daftarSoal = await prisma.soal.findMany();
            let jawabanBenarTotal = 0;

            daftarSoal.forEach(soal => {
                const jawabanPeserta = jawabanObj[soal.id_soal];
                if (jawabanPeserta && jawabanPeserta === soal.jawaban_benar) {
                    jawabanBenarTotal += 1;
                }
            });

            const nilaiAkhir = daftarSoal.length > 0 ? (jawabanBenarTotal / daftarSoal.length) * 100 : 0;

            await prisma.hasilUjian.update({
                where: { id_pengguna: idPengguna },
                data: {
                    jawaban_peserta: JSON.stringify(jawabanObj),
                    status_ujian: 'selesai',
                    nilai_akhir: nilaiAkhir
                }
            });

            res.json({ status: 'sukses', nilai: nilaiAkhir });
        } catch (galat) {
            console.error(galat);
            res.status(500).json({ status: 'gagal' });
        }
    } else {
        res.status(403).json({ status: 'ditolak' });
    }
});

app.get('/keluar', (req, res) => {
    req.session.destroy(); 
    res.redirect('/');
});

app.listen(port, () => {
    console.log(`Peladen berjalan di port ${port}`);
});

module.exports = app;
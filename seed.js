const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    // Membuat akun percobaan untuk panitia
    await prisma.pengguna.create({
        data: {
            nama_lengkap: 'Panitia Pusat',
            email: 'panitia@web.com',
            kata_sandi: '12345',
            peran: 'panitia',
            status_tahapan: 'siap_ujian'
        }
    });

    // Membuat akun percobaan untuk peserta
    await prisma.pengguna.create({
        data: {
            nama_lengkap: 'Peserta Ujian',
            email: 'peserta@web.com',
            kata_sandi: '12345',
            peran: 'peserta',
            status_tahapan: 'isi_data'
        }
    });

    console.log('Data awal berhasil ditambahkan ke dalam basis data!');
}

main()
    .catch((galat) => {
        console.error(galat);
        process.exit(1);
    })
    .finally(async () => {
        // Memutus koneksi Prisma setelah selesai
        await prisma.$disconnect();
    });
// netlify/functions/summon.mjs
//
// Versi ESM dari function pembungkus express app (server.js).
// Karena ekstensinya .mjs, file ini WAJIB pakai sintaks import/export,
// bukan require()/module.exports.
//
// server.js sendiri tetap CommonJS (module.exports = { app, initDb }),
// itu tidak masalah — Node bisa meng-import module CJS dari file ESM.

import serverless from 'serverless-http';
import pkg from '/server.js';

const { app, initDb } = pkg;

let initialized = false;
const serverlessHandler = serverless(app);

export const handler = async (event, context) => {
    // Supaya koneksi pool pg tidak "menggantung" dan bikin function timeout
    context.callbackWaitsForEmptyEventLoop = false;

    // Pastikan tabel sudah ada sebelum request pertama diproses.
    // Hanya dijalankan sekali per cold start, bukan setiap request.
    if (!initialized) {
        await initDb();
        initialized = true;
    }

    return serverlessHandler(event, context);
};

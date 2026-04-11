"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
require("dotenv/config");
exports.config = {
    port: parseInt(process.env.PORT || '4000'),
    host: process.env.HOST || '127.0.0.1',
    databaseUrl: process.env.DATABASE_URL || '',
    supabaseUrl: process.env.SUPABASE_URL || '',
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '',
    corsOrigin: (process.env.CORS_ORIGIN || 'http://localhost:3000').split(',').map(function (s) { return s.trim(); }),
};
if (!exports.config.databaseUrl)
    throw new Error('DATABASE_URL is required');
if (!exports.config.supabaseUrl)
    throw new Error('SUPABASE_URL is required');
if (!exports.config.supabaseAnonKey)
    throw new Error('SUPABASE_ANON_KEY is required');

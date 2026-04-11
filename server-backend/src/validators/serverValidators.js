"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateCreateServer = validateCreateServer;
exports.validateJoinServer = validateJoinServer;
function validateCreateServer(body, res) {
    var _a, _b;
    var name = String((_a = body.name) !== null && _a !== void 0 ? _a : '').trim();
    var description = String((_b = body.description) !== null && _b !== void 0 ? _b : '').trim();
    if (!name || name.length < 2 || name.length > 32) {
        res.status(400).json({ error: 'Sunucu adı 2-32 karakter olmalı' });
        return null;
    }
    if (description.length > 200) {
        res.status(400).json({ error: 'Açıklama en fazla 200 karakter olabilir' });
        return null;
    }
    return { name: name, description: description };
}
function validateJoinServer(body, res) {
    var _a;
    var code = String((_a = body.code) !== null && _a !== void 0 ? _a : '').trim().toUpperCase();
    if (!code || code.length < 4 || code.length > 12) {
        res.status(400).json({ error: 'Geçerli bir davet kodu gir' });
        return null;
    }
    return { code: code };
}

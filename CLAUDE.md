# Proje Kuralları — PigeVox

## Türkçe UI Text Yazım Standardı

Kullanıcıya görünen TÜM metinler doğrudan UTF-8 Türkçe karakter ile yazılmalı.

### YASAK
- Unicode escape: `\u0131`, `\u00fc`, `\u015f` vb.
- Çift escape: `\\u0131`
- String başında kaçış: `\Ş`, `\Ç`, `\Ğ`, `\İ`, `\Ö`, `\Ü`
- JSON stringify edilmiş UI metni

### DOĞRU
```tsx
<label>Şifre Tekrar</label>
<button>Kaydet</button>
<input placeholder="Kullanıcı ara..." />
```

### Refactor / Büyük Değişiklik Sonrası Kontrol
Her büyük değişiklikten sonra şu pattern'leri ara ve düzelt:
- `\u0` (unicode escape)
- `\Ç`, `\Ş`, `\Ğ`, `\İ`, `\Ö`, `\Ü` (stray backslash)

### Agent Kuralı
Kod üretirken Türkçe metinleri ASLA escape etme. Olduğu gibi UTF-8 yaz.

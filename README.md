# AS Visa GitHub Botu

Bu proje GitHub Actions üzerinde AS Visa randevu sayfalarını yaklaşık 5 dakikada bir kontrol eder ve uygun randevu tespit edilirse Telegram mesajı gönderir.

Kontrol edilen hedefler:
- Macaristan - Istanbul
- Macaristan - Ankara
- Portekiz - Istanbul
- Slovenya - Istanbul

## Önemli

- Bot otomatik randevu ALMAZ; yalnızca uygunluk tespiti ve bildirim yapar.
- CAPTCHA / insan doğrulamasını aşmaz. GitHub IP'si doğrulamaya takılırsa Telegram'a günde en fazla bir uyarı yollar.
- GitHub zamanlanmış görevleri tam saniyesinde garanti edilmez; yoğunlukta 5 dakikalık tetikleme gecikebilir.
- Telegram tokenını dosyalara yazmayın. GitHub Actions Secrets kullanın.

Kurulum için `KURULUM.md` dosyasını izleyin.

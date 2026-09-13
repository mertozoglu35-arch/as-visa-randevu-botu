# KURULUM - 10 DAKIKA

## 1) GitHub deposu oluştur

1. https://github.com/new adresini aç.
2. Repository name: `as-visa-randevu-botu`
3. Public seç. (Ücretsiz Actions kullanımı açısından en sorunsuz seçenek.)
4. `Create repository` bas.

## 2) Dosyaları yükle

1. Bu ZIP'i bilgisayarda klasöre çıkart.
2. GitHub reposunda `uploading an existing file` / `Add file > Upload files` seç.
3. Çıkartılan klasörün İÇİNDEKİ tüm dosya ve klasörleri yükle. `.github` klasörü de mutlaka gitmeli.
4. `Commit changes` bas.

## 3) Telegram bilgilerini Secret olarak ekle

Repo > `Settings` > `Secrets and variables` > `Actions` > `New repository secret`

İki Secret oluştur:

- Name: `TELEGRAM_BOT_TOKEN`
  Secret: BotFather'ın verdiği YENİ bot tokenı

- Name: `TELEGRAM_CHAT_ID`
  Secret: Telegram `getUpdates` ekranından aldığın kendi `chat.id` numaran

Tokenı kod içine veya README'ye yazma.

## 4) İlk testi elle çalıştır

1. Repo > `Actions`
2. Soldan `AS Visa 5 Dakika Takip`
3. `Run workflow`
4. Yeşil `Run workflow` düğmesine bas.
5. 1-3 dakika içinde Telegram'a test özeti gelmeli.

Test mesajında dört merkez de `randevu yok` görünüyorsa sistem GitHub üzerinden çalışıyor demektir.

Eğer `CAPTCHA / doğrulama` mesajı gelirse GitHub veri merkezi IP'si AS Visa tarafından engelleniyor demektir. Bot CAPTCHA'yı aşmaz; bu durumda bu ücretsiz yöntem güvenilir olmayacaktır.

## 5) Sonrası

Workflow zaten `*/5 * * * *` cron ile ayarlı. Bilgisayarın kapalı olsa bile GitHub tarafında çalışır.

Randevu tespit edilirse Telegram mesajında ülke, merkez, tarih, saat ve AS Visa bağlantısı gelir.

Aynı slot kümesi tekrar tekrar görünürse cache ile yinelenen bildirim bastırılır.

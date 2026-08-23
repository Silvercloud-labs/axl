# FAQ — Sık Sorulan Sorular

---

### AXL açık kaynaklı mı, yoksa sadece ücretsiz mi?

**Açık kaynaklıdır.** Apache License 2.0, OSI onaylı bir lisans. Okuyabilir, çalıştırabilir, değiştirebilir, yeniden dağıtabilir, fork edebilir ve üzerine kurulu yazılımları ticari olarak satabilirsiniz — izin almadan ve ödeme yapmadan.

Açık çekirdek bölünmesi, ücretli katman, telemetri veya geri tutulan özellik yoktur. Derleyici, runtime motoru, CLI, oluşturucular ve VS Code uzantısı dahil tüm araç zinciri bu depoda bulunmaktadır.

### Neden Apache 2.0, MIT değil?

| | MIT | Apache 2.0 |
|---|---|---|
| Özgürce kullanma, değiştirme, satma | Evet | Evet |
| Açık patent izni | Hayır | Evet |
| İsim marka koruması | Hayır | Evet |
| Değişiklikleri belirtme zorunluluğu | Hayır | Evet |

### Üretim için hazır mı?

**Henüz değil ve dürüst cevap şu ki hiçbir şey yayınlanmadı.**

| | Durum |
|---|---|
| Derleyici, runtime, CLI | Çalışıyor, 750 test geçiyor |
| npm'de yayınlandı | Hayır. İlk sürüm henüz çıkarılmadı |
| VS Code uzantısı Marketplace'te | Hayır. Kaynaktan derleyin |
| Üretimde kullanıldı | Bildiğimiz kadarıyla hayır |

### AXL ne yapmaz?

| Kapsam dışı | Neden |
|---|---|
| Kimlik doğrulama, ödeme, kimlik altyapısı | Backend endişesi. AXL hiçbir zaman kimlik bilgisi oluşturmaz, depolamaz veya doğrulamaz |
| OAuth entegrasyonları | Tamamen backend'e ait |
| Veritabanı veya ORM | AXL alan verisi tutmaz |
| Tam MCP eşdeğerliği | Prompts, Notifications, Progress tracking veya Roots yok |
| Uygulama kodu analizi | `axl adapt` API spesifikasyonlarını okur |
| Telafi edici işlemler | Başarısız bir iş akışı tamamlanan adımları geri almaz |

### Backend'imi yeniden yazmam gerekiyor mu?

Hayır. AXL backend'inizi hiçbir zaman değiştirmez — önünde durur ve HTTP üzerinden çağırır.

### Güvenlik sorununu nasıl bildiririm?

Genel bir issue'da değil. GitHub'ın özel güvenlik açığı bildirimini kullanın — [SECURITY.md](SECURITY.md)'ye bakın.

### Nasıl katkıda bulunabilirim?

[CONTRIBUTING.md](CONTRIBUTING.md)'ye bakın.

---

Burada eksik bir şey var mı? [Issue açın](https://github.com/Silvercloud-labs/axl/issues).

# FAQ — বাংলা

---

### AXL কি ওপেন সোর্স, নাকি শুধু বিনামূল্যে?

**ওপেন সোর্স।** Apache License 2.0, OSI-অনুমোদিত লাইসেন্স। আপনি এটি পড়তে, চালাতে, পরিবর্তন করতে, পুনর্বিতরণ করতে, fork করতে এবং এর উপর নির্মিত সফ্টওয়্যার বিক্রি করতে পারবেন — বাণিজ্যিকভাবে, অনুমতি চাওয়া ছাড়াই এবং পেমেন্ট ছাড়াই।

কোনো open-core বিভাজন নেই, কোনো পেইড টায়ার নেই, কোনো টেলিমেট্রি নেই, এবং কোনো বৈশিষ্ট্য আটকে রাখা হয়নি।

### কেন Apache 2.0, MIT নয়?

| | MIT | Apache 2.0 |
|---|---|---|
| ব্যবহার, পরিবর্তন, বিক্রির স্বাধীনতা | হ্যাঁ | হ্যাঁ |
| স্পষ্ট পেটেন্ট অনুদান | না | হ্যাঁ |
| নামের ট্রেডমার্ক সুরক্ষা | না | হ্যাঁ |
| পরিবর্তন উল্লেখ করতে হবে | না | হ্যাঁ |

### এটি কি প্রোডাকশনের জন্য প্রস্তুত?

**এখনও না।**

| | অবস্থা |
|---|---|
| Compiler, runtime, CLI | কার্যকর, 750 tests পাস |
| npm-এ প্রকাশিত | না |
| VS Code extension Marketplace-এ | না। source থেকে build করুন |
| production-এ ব্যবহৃত | আমাদের জানামতে, না |

### AXL কী করে না?

| স্কোপের বাইরে | কারণ |
|---|---|
| Auth, পেমেন্ট, পরিচয় | Backend-এর দায়িত্ব |
| OAuth integrations | সম্পূর্ণ backend-এর |
| Database বা ORM | AXL domain data রাখে না |
| সম্পূর্ণ MCP সমতা | Prompts, Notifications ইত্যাদি নেই |
| Source code বিশ্লেষণ | `axl adapt` API specifications পড়ে |
| Compensating transactions | Failed workflow steps rollback করে না |

### আমাকে কি backend পুনরায় লিখতে হবে?

না। AXL কখনো আপনার backend প্রতিস্থাপন করে না।

### নিরাপত্তা সমস্যা কীভাবে রিপোর্ট করব?

Public issue-এ নয়। GitHub-এর private vulnerability reporting ব্যবহার করুন — [SECURITY.md](SECURITY.md) দেখুন।

---

এখানে কিছু মিস হয়েছে? [একটি issue খুলুন](https://github.com/Silvercloud-labs/axl/issues).

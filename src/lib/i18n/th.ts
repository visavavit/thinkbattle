import type { Dictionary } from "./en";

/** Thai dictionary — formal news-desk register. */
export const th: Dictionary = {
  // ---- brand / shell
  "brand.arena": "อารีนา",
  "nav.feed": "หน้าแรก",
  "nav.browse": "หมวดหมู่",
  "nav.admin": "ผู้ดูแล",
  "nav.signIn": "เข้าสู่ระบบ",
  "nav.signOut": "ออกจากระบบ",
  "footer.tagline": "VS Arena · สองทางเลือก รับฟังทั้งสองฝ่าย",
  "lang.switchToThai": "เปลี่ยนเป็นภาษาไทย",
  "lang.switchToEnglish": "เปลี่ยนเป็นภาษาอังกฤษ",

  // ---- notifications
  "notif.title": "การแจ้งเตือน",
  "notif.open": "การแจ้งเตือน",
  "notif.unreadBadge": "ยังไม่ได้อ่าน {n} รายการ",
  "notif.empty": "ยังไม่มีการแจ้งเตือน ลองแสดงความเห็นแล้วรอดูปฏิกิริยา",
  "notif.markAllRead": "ทำเครื่องหมายว่าอ่านแล้วทั้งหมด",
  "notif.someone": "ผู้ใช้รายหนึ่ง",
  "notif.reply": "{actor} ตอบกลับความเห็นของคุณ",
  "notif.like": "{actor} ถูกใจความเห็นของคุณ",
  "notif.dislike": "{actor} ไม่เห็นด้วยกับความเห็นของคุณ",
  "notif.topicPublished": "ประเด็นที่คุณเสนอเผยแพร่แล้ว",
  "notif.deleted": "ความเห็นนี้ถูกลบแล้ว",
  "notif.justNow": "เมื่อสักครู่",
  "notif.minutesAgo": "{n} นาทีที่แล้ว",
  "notif.hoursAgo": "{n} ชั่วโมงที่แล้ว",
  "notif.daysAgo": "{n} วันที่แล้ว",

  // ---- error / not found
  "notFound.title": "ไม่พบหน้าที่ต้องการ",
  "notFound.body": "หน้าที่คุณกำลังค้นหาไม่มีอยู่ หรืออาจถูกย้ายไปแล้ว",
  "common.goHome": "กลับหน้าแรก",
  "error.title": "ไม่สามารถโหลดหน้านี้ได้",
  "error.body": "เกิดข้อผิดพลาดในระบบ กรุณาลองใหม่อีกครั้ง หรือกลับไปยังหน้าแรก",
  "common.tryAgain": "ลองอีกครั้ง",
  "common.cancel": "ยกเลิก",

  // ---- home
  "home.heroLead": "เลือกแล้วอธิบายเหตุผล",
  "home.heroAccent": "แล้อธิบายเหตุผล",
  "home.heroSub":
    "ร่วมโหวตประเด็นที่สังคมกำลังถกเถียง แล้วอ่านเหตุผลที่ดีที่สุดจากทั้งสองฝ่ายเคียงข้างกัน",
  "home.headliner": "⚡ ประเด็นเด่น",
  "home.castVote": "ร่วมโหวต",
  "home.emptyTab": "ยังไม่มีประเด็นในหมวดนี้ — ลองเลือกตัวกรองอื่น",
  "tab.trending": "กำลังมาแรง",
  "tab.neck": "สูสี",
  "tab.top": "โหวตสูงสุด",
  "tab.newest": "ล่าสุด",

  // ---- browse
  "browse.title": "สำรวจประเด็นทั้งหมด",
  "browse.allCategories": "ทุกหมวดหมู่",
  "browse.allTags": "ทุกแท็ก",
  "browse.empty": "ไม่พบประเด็นที่ตรงกับตัวกรองนี้",

  // ---- topic page
  "topic.backToFeed": "กลับไปหน้าแรก",
  "topic.loadFailed": "ไม่สามารถโหลดประเด็นนี้ได้",
  "topic.notFound": "ไม่พบประเด็นนี้",

  // ---- vote / split bar
  "vote.noVotes": "ยังไม่มีการโหวต",
  "vote.noVotesAria": "ยังไม่มีการโหวต {a} เทียบกับ {b}",
  "vote.yourVote": "คะแนนของคุณ",
  "vote.countOne": "{n} โหวต",
  "vote.countMany": "{n} โหวต",
  "vote.totalVotes": "รวม {n} โหวต",
  "vote.canSwitch": " — คุณสามารถเปลี่ยนฝ่ายได้ตลอดเวลา",
  "vote.pickToUnlock": " — เลือกฝ่ายเพื่อเปิดอ่านและร่วมแสดงความคิดเห็น",
  "vote.signInToVote": "เข้าสู่ระบบเพื่อโหวต",
  "vote.failed": "โหวตไม่สำเร็จ กรุณาลองใหม่อีกครั้ง",
  "vote.switched": "เปลี่ยนฝ่ายเรียบร้อย ความเห็นเดิมของคุณยังคงอยู่ และถูกกำกับว่าเปลี่ยนความคิด",
  "vote.suspendedVote": "บัญชีของคุณถูกระงับ จึงไม่สามารถโหวตได้",
  "vote.suspendedReact": "บัญชีของคุณถูกระงับ จึงไม่สามารถแสดงความรู้สึกได้",
  "vote.signInToReact": "เข้าสู่ระบบเพื่อกดถูกใจหรือไม่ถูกใจ",

  // ---- side switch dialog
  "switch.title": "ต้องการเปลี่ยนไปฝ่าย {label} หรือไม่",
  "switch.body": "คะแนนของคุณจะย้ายไปอีกฝ่าย และสัดส่วนผลโหวตจะอัปเดตทันที",
  "switch.bodyWithTakes":
    " ความเห็น {n} รายการของคุณภายใต้หัวข้อ “ทำไมต้อง {label}” จะยังคงเผยแพร่พร้อมยอดถูกใจเดิม และจะถูกกำกับว่า “เปลี่ยนความคิด” โดยคุณจะไม่สามารถแสดงความเห็นในคอลัมน์นั้นได้อีก",
  "switch.bodyNoTakes": " หลังจากนี้คุณจะสามารถแสดงความเห็นในคอลัมน์อีกฝ่ายได้",
  "switch.confirm": "ยืนยันเปลี่ยนฝ่าย",

  // ---- ban banner
  "ban.title": "บัญชีของคุณถูกระงับการใช้งาน",
  "ban.body": "คุณยังอ่านทุกประเด็นได้ แต่ไม่สามารถโหวต แสดงความเห็น หรือแสดงความรู้สึกได้",
  "ban.reason": " เหตุผล: {reason}",

  // ---- comment columns
  "col.why": "ทำไมต้อง {label}",
  "col.showOneSide": "แสดงความเห็นทีละฝ่าย",
  "col.showing": "กำลังแสดงฝ่าย {label}",
  "comment.loadMore": "โหลดความเห็นเพิ่ม",
  "comment.loading": "กำลังโหลด…",
  "sort.top": "ถูกใจสูงสุด",
  "sort.wild": "ความเห็นสุดขั้ว",
  "sort.newest": "ล่าสุด",
  "comment.placeholder": "อธิบายเหตุผลของฝ่ายคุณ...",
  "comment.post": "เผยแพร่ความเห็น",
  "comment.posted": "เผยแพร่ความเห็นเรียบร้อย",
  "comment.tooLong": "ความเห็นยาวเกินไป (ไม่เกิน 2,000 ตัวอักษร)",
  "comment.failed": "ไม่สามารถเผยแพร่ความเห็นนี้ได้",
  "comment.lockedBanned": "บัญชีของคุณถูกระงับ อ่านได้แต่แสดงความเห็นไม่ได้",
  "comment.lockedOtherSide": "คุณโหวตให้อีกฝ่าย คอลัมน์นี้จึงอ่านได้อย่างเดียว",
  "comment.lockedVote": "โหวตด้านบนเพื่อเปิดใช้งานคอลัมน์นี้",
  "comment.lockedSignIn": "เข้าสู่ระบบและโหวตเพื่อร่วมแสดงความเห็น",
  "comment.empty": "ยังไม่มีความเห็นในฝ่ายนี้ เริ่มเป็นคนแรกได้เลย",
  "comment.anonymous": "ไม่ระบุชื่อ",
  "comment.changedMind": "เปลี่ยนความคิด",
  "comment.changedMindTitle": "ผู้ใช้รายนี้เปลี่ยนไปโหวตให้ {label} แล้ว",
  "comment.hidden": "ถูกซ่อนโดยผู้ดูแล",
  "comment.wildTake": "ความเห็นสุดขั้ว",
  "comment.topTake": "ความเห็นเด่น",

  // ---- replies
  "reply.action": "ตอบกลับ",
  "reply.placeholder": "ตอบกลับความเห็นนี้...",
  "reply.posted": "ตอบกลับเรียบร้อย",
  "reply.failed": "ไม่สามารถตอบกลับได้",

  // ---- reports
  "report.tooltip": "รายงานต่อผู้ดูแล",
  "report.aria": "รายงานความเห็นนี้",
  "report.title": "รายงานความเห็นนี้",
  "report.body": "ผู้ดูแลจะเห็นเนื้อหาความเห็น ผู้เขียน และเหตุผลที่คุณระบุ",
  "report.placeholder": "คุกคาม สแปม หรือไม่เกี่ยวข้องกับประเด็น",
  "report.send": "ส่งรายงาน",
  "report.needReason": "กรุณาระบุเหตุผลให้ผู้ดูแลทราบ",
  "report.duplicate": "คุณรายงานความเห็นนี้ไปแล้ว",
  "report.failed": "ไม่สามารถส่งรายงานได้",
  "report.sent": "ส่งรายงานแล้ว ผู้ดูแลจะตรวจสอบโดยเร็ว",

  // ---- moderation (inline, admin)
  "mod.hide": "ซ่อนจากสาธารณะ",
  "mod.hideAria": "ซ่อนความเห็นนี้",
  "mod.restore": "กู้คืนความเห็นนี้",
  "mod.delete": "ลบถาวร",
  "mod.deleteAria": "ลบความเห็นนี้",
  "mod.confirmDelete": "ยืนยันลบความเห็นของ {name} อย่างถาวรหรือไม่",
  "mod.failed": "ดำเนินการไม่สำเร็จ",
  "mod.deleted": "ลบความเห็นแล้ว",
  "mod.hidden": "ซ่อนความเห็นแล้ว",
  "mod.restored": "กู้คืนแล้ว",

  // ---- suggest dialog
  "suggest.trigger": "เสนอประเด็น",
  "suggest.title": "เสนอประเด็นถกเถียง",
  "suggest.body": "ผู้ดูแลจะตรวจสอบทุกข้อเสนอก่อนเผยแพร่",
  "suggest.fieldTitle": "หัวข้อ",
  "suggest.titlePlaceholder": "เทนมก่อนซีเรียล หรือซีเรียลก่อนนม",
  "suggest.description": "คำอธิบาย (ไม่บังคับ)",
  "suggest.choiceA": "ตัวเลือก ก",
  "suggest.choiceB": "ตัวเลือก ข",
  "suggest.category": "หมวดหมู่",
  "suggest.tags": "แท็ก",
  "suggest.submit": "ส่งให้ผู้ดูแลตรวจสอบ",
  "suggest.sent": "ส่งเข้าคิวตรวจสอบเรียบร้อย",
  "suggest.failed": "ไม่สามารถส่งข้อเสนอของคุณได้",
  "suggest.checkForm": "กรุณาตรวจสอบข้อมูลในแบบฟอร์ม",
  "suggest.errTitle": "หัวข้อต้องมีอย่างน้อย 6 ตัวอักษร",
  "suggest.errChoiceA": "กรุณาระบุตัวเลือก ก",
  "suggest.errChoiceB": "กรุณาระบุตัวเลือก ข",
  "suggest.errCategory": "กรุณาเลือกหมวดหมู่",

  // ---- tag input
  "tags.placeholder": "พิมพ์แท็กแล้วกด Enter",
  "tags.max": "ได้สูงสุด {n} แท็ก",
  "tags.hint": "คั่นด้วยเครื่องหมายจุลภาค เว้นวรรค หรือกด Enter · สูงสุด {n} แท็ก",
  "tags.remove": "ลบแท็ก {tag}",

  // ---- uploads
  "upload.label": "อัปโหลดรูปภาพ",
  "upload.busy": "กำลังอัปโหลด…",
  "upload.tooBig": "ไฟล์ภาพต้องมีขนาดไม่เกิน 5 MB",
  "upload.done": "อัปโหลดรูปภาพเรียบร้อย",
  "upload.failed": "อัปโหลดไม่สำเร็จ",
  "upload.readFailed": "ไม่สามารถอ่านไฟล์นี้ได้",

  // ---- auth
  "auth.signInTitle": "เข้าสู่ระบบ",
  "auth.signUpTitle": "สมัครสมาชิก",
  "auth.sub": "ต้องมีบัญชีผู้ใช้จึงจะโหวต แสดงความเห็น และแสดงความรู้สึกได้",
  "auth.email": "อีเมล",
  "auth.password": "รหัสผ่าน",
  "auth.signIn": "เข้าสู่ระบบ",
  "auth.createAccount": "สร้างบัญชี",
  "auth.or": "หรือ",
  "auth.google": "ดำเนินการต่อด้วย Google",
  "auth.toSignUp": "ยังไม่มีบัญชี? สมัครสมาชิก",
  "auth.toSignIn": "มีบัญชีอยู่แล้ว? เข้าสู่ระบบ",
  "auth.checkEmail": "กรุณาตรวจสอบอีเมลเพื่อยืนยันบัญชีของคุณ",
  "auth.googleFailed": "เข้าสู่ระบบด้วย Google ไม่สำเร็จ",
  "auth.errEmail": "กรุณากรอกอีเมลให้ถูกต้อง",
  "auth.errPassword": "รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร",
  "auth.checkDetails": "กรุณาตรวจสอบข้อมูลของคุณ",

  // ---- card meta
  "card.votes": "{n} โหวต",
  "card.wild": "สุดขั้ว {n}",

  // ---- head metadata
  "meta.home.title": "VS Arena — เลือกฝ่าย แล้วอธิบายเหตุผล",
  "meta.home.description":
    "เวทีถกเถียงแบบสองทางเลือก พร้อมคอลัมน์ความเห็นแยกฝ่าย และการจัดอันดับความเห็นสุดขั้วจากทั้งสองฝั่ง",
  "meta.home.ogDescription": "ร่วมโหวตประเด็นสองทางเลือก และถกเถียงในคอลัมน์ความเห็นแยกฝ่าย",
  "meta.browse.title": "สำรวจประเด็นตามหมวดหมู่ — VS Arena",
  "meta.browse.description":
    "กรองประเด็นถกเถียงตามหมวดหมู่และแท็ก ทั้งเทคโนโลยี อาหาร วัฒนธรรมป็อป ไลฟ์สไตล์ และกีฬา",
  "meta.auth.title": "เข้าสู่ระบบ — VS Arena",
  "meta.auth.description": "เข้าสู่ระบบเพื่อโหวตและร่วมแสดงความเห็นใน VS Arena",
  "meta.topic.unavailable": "ไม่พบประเด็นนี้ — VS Arena",
  "meta.topic.description": "{a} เทียบกับ {b} ร่วมโหวต แล้วอธิบายเหตุผลในคอลัมน์ความเห็นแยกฝ่าย",
};

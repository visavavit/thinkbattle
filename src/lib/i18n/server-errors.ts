/**
 * Database guards (spam limits, validation, permissions) raise English
 * messages. They are surfaced verbatim in toasts, so map the known ones to
 * Thai instead of translating in SQL.
 */
export const serverMessagesTh: Record<string, string> = {
  "Slow down — wait a few seconds between comments.":
    "ช้าลงสักนิด กรุณาเว้นระยะสองสามวินาทีก่อนแสดงความเห็นครั้งถัดไป",
  "You are posting too fast. Try again in a minute.":
    "คุณแสดงความเห็นถี่เกินไป กรุณาลองใหม่ในอีกหนึ่งนาที",
  "Hourly comment limit reached. Take a breather.":
    "คุณแสดงความเห็นครบจำนวนที่กำหนดต่อชั่วโมงแล้ว กรุณาพักสักครู่",
  "Your comment is too short.": "ความเห็นสั้นเกินไป",
  "Your comment is too long (2000 characters max).":
    "ความเห็นยาวเกินไป (ไม่เกิน 2,000 ตัวอักษร)",
  "That looks like spam. Try writing a real take.":
    "เนื้อหานี้เข้าข่ายสแปม กรุณาเขียนความเห็นที่มีเนื้อหาจริง",
  "Please turn off caps lock before posting.":
    "กรุณาปิดการพิมพ์ตัวพิมพ์ใหญ่ทั้งหมดก่อนเผยแพร่",
  "You already posted that here.": "คุณเคยเผยแพร่ข้อความเดียวกันนี้ไปแล้ว",
  "That comment no longer exists.": "ไม่พบความเห็นนี้แล้ว",
  "You can only reply to a top-level take.": "สามารถตอบกลับได้เฉพาะความเห็นหลักเท่านั้น",
  "Reply must stay on the same topic.": "การตอบกลับต้องอยู่ในประเด็นเดียวกัน",
  "Too many reactions too quickly.": "คุณแสดงความรู้สึกถี่เกินไป",
  "Too many reports in a short time.": "คุณส่งรายงานถี่เกินไป",
  "You already reported this comment.": "คุณรายงานความเห็นนี้ไปแล้ว",
  "You already suggested that topic.": "คุณเคยเสนอประเด็นนี้ไปแล้ว",
  "You have suggested too many topics this hour.":
    "คุณเสนอประเด็นเกินจำนวนที่กำหนดในชั่วโมงนี้",
  "Give your topic a real title.": "กรุณาตั้งหัวข้อให้ชัดเจน",
  "Sign in to add tags": "กรุณาเข้าสู่ระบบเพื่อเพิ่มแท็ก",
  "Your account cannot add tags": "บัญชีของคุณไม่สามารถเพิ่มแท็กได้",
  "You can add up to 6 tags": "เพิ่มแท็กได้สูงสุด 6 รายการ",
  "Not permitted for your role.": "บัญชีของคุณไม่มีสิทธิ์ดำเนินการนี้",
  "That already exists.": "รายการนี้มีอยู่แล้ว",
  "Admins only.": "เฉพาะผู้ดูแลระบบเท่านั้น",
  "This debate has closed. Voting and comments are final.":
    "ประเด็นนี้ปิดแล้ว ผลโหวตและความเห็นถือเป็นที่สิ้นสุด",
};

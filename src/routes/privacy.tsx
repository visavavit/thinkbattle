import { createFileRoute } from "@tanstack/react-router";
import { LegalPage, type LegalContent } from "@/components/LegalPage";
import { seoTags } from "@/lib/site";

const TITLE = "นโยบายความเป็นส่วนตัว — Privacy Policy | toktiang.com";
const DESCRIPTION =
  "What data toktiang.com collects, how it is used, who can see it, and how to delete your account.";

export const Route = createFileRoute("/privacy")({
  head: () => {
    const seo = seoTags("/privacy");
    return {
      meta: [
        { title: TITLE },
        { name: "description", content: DESCRIPTION },
        { property: "og:title", content: TITLE },
        { property: "og:description", content: DESCRIPTION },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary_large_image" },
        ...seo.meta,
      ],
      links: seo.links,
    };
  },
  component: () => <LegalPage content={CONTENT} />,
});

const CONTENT: Record<"th" | "en", LegalContent> = {
  th: {
    title: "นโยบายความเป็นส่วนตัว",
    updated: "ปรับปรุงล่าสุด: 26 สิงหาคม 2026",
    sections: [
      {
        heading: "ข้อมูลที่เราเก็บ",
        body: [
          "บัญชี: อีเมล และชื่อที่แสดง (รวมถึงข้อมูลโปรไฟล์พื้นฐานหากเข้าสู่ระบบด้วย Google)",
          "กิจกรรม: การโหวต ความเห็น การกดถูกใจ/ไม่ถูกใจ การรายงาน หัวข้อที่เสนอ และเวลาที่ทำรายการ เพื่อใช้แสดงผลและป้องกันสแปม",
          "รูปภาพที่คุณอัปโหลด: รูปโปรไฟล์ และรูปที่แนบมากับความเห็นในกรณีที่เปิดใช้งานฟีเจอร์นี้ ทุกไฟล์ที่อัปโหลดจะถูกบันทึกผูกกับบัญชีของคุณ เพื่อให้ตรวจสอบที่มาและลบออกได้ในภายหลัง ไฟล์จะถูกแปลงใหม่ในเบราว์เซอร์ของคุณก่อนส่ง ซึ่งเป็นการลบข้อมูลกำกับภาพจากกล้อง เช่น พิกัด GPS ออกไปด้วย",
          "เราไม่เก็บข้อมูลการชำระเงิน และไม่ขายข้อมูลของคุณ",
        ],
      },
      {
        heading: "สิ่งที่เป็นสาธารณะ",
        body: [
          "ชื่อที่แสดง ความเห็น และฝั่งที่คุณเลือกในหัวข้อที่คุณแสดงความเห็น จะมองเห็นได้โดยสาธารณะ อีเมลของคุณไม่ถูกเปิดเผยต่อผู้ใช้อื่น",
          "รูปที่แนบมากับความเห็นก็เป็นสาธารณะเช่นกัน และเปิดดูได้จากลิงก์โดยตรงโดยผู้ที่มีลิงก์นั้น จึงไม่ควรแนบสิ่งที่คุณไม่ต้องการเผยแพร่ต่อสาธารณะ เมื่อคุณลบความเห็น เอารูปออก หรือผู้ดูแลซ่อนความเห็นนั้น ไฟล์รูปจะถูกลบออกจากที่จัดเก็บ",
        ],
      },
      {
        heading: "การจัดเก็บและผู้ให้บริการ",
        body: [
          "ข้อมูลจัดเก็บบนโครงสร้างพื้นฐานฐานข้อมูลและโฮสติ้งของผู้ให้บริการภายนอก (Supabase และ Cloudflare) รูปภาพจัดเก็บบน Cloudflare R2",
          "เราใช้ Cloudflare Web Analytics เพื่อนับจำนวนผู้เข้าชม บริการนี้ไม่ใช้คุกกี้ ไม่จัดเก็บข้อมูลใดไว้บนอุปกรณ์ของคุณ และไม่ติดตามคุณข้ามเว็บไซต์",
          "ฟอนต์ให้บริการผ่าน Google Fonts เมื่อหน้าเว็บโหลด คำขอจากเบราว์เซอร์ของคุณซึ่งรวมถึงหมายเลขไอพีจะถูกส่งไปยัง Google",
        ],
      },
      {
        heading: "คุกกี้และการจัดเก็บในเบราว์เซอร์",
        body: [
          "เราใช้ที่จัดเก็บในเบราว์เซอร์เพื่อรักษาสถานะการเข้าสู่ระบบ จดจำภาษาที่เลือก และหากคุณร่วมโหวตโดยไม่ได้เข้าสู่ระบบ จะจดจำฝั่งที่คุณเลือกไว้ในอุปกรณ์นี้ด้วย ไม่มีคุกกี้โฆษณา",
          "หากคุณร่วมโหวตโดยไม่ได้เข้าสู่ระบบ เราจะตั้งคุกกี้ที่มีรหัสอุปกรณ์แบบสุ่ม เพื่อให้หนึ่งอุปกรณ์นับเป็นหนึ่งคะแนนต่อหนึ่งประเด็น และเพื่อให้คุณเปลี่ยนใจได้ภายหลัง รหัสนี้ไม่ผูกกับตัวตนของคุณ และจะถูกลบเมื่อคุณเข้าสู่ระบบ",
          "เพื่อป้องกันการโหวตซ้ำโดยอัตโนมัติ เราบันทึกค่าแฮชของหมายเลขไอพีพร้อมวันที่ ไม่ใช่หมายเลขไอพีโดยตรง ค่าแฮชจะเปลี่ยนทุกวันจึงไม่สามารถเชื่อมโยงข้ามวันได้",
          "ผู้ให้บริการโครงสร้างพื้นฐานตั้งคุกกี้อีกส่วนหนึ่งที่เราไม่ได้ตั้งเอง: Cloudflare ซึ่งอยู่หน้าเว็บไซต์ตั้งคุกกี้อายุสั้นราว 30 นาที (__cf_bm) เพื่อแยกทราฟฟิกอัตโนมัติออกจากผู้ใช้จริง ส่วนผู้ให้บริการโฮสติ้งตั้งคุกกี้ที่ระบุว่าเว็บไซต์รุ่นใดให้บริการหน้านั้น (__dpl) เพื่อให้ไฟล์ที่โหลดตามมาตรงรุ่นกัน และคุกกี้ระดับเซสชันสำหรับวัดประสิทธิภาพ",
          "คุกกี้เหล่านี้ไม่บรรจุรหัสบัญชีหรือโปรไฟล์ของคุณ",
        ],
      },
      {
        heading: "สิทธิของคุณ",
        body: [
          "คุณขอเข้าถึง แก้ไข หรือลบบัญชีและเนื้อหาของคุณได้ที่ hello@toktiang.com เราจะดำเนินการภายในเวลาอันสมควร",
          "รวมถึงรูปภาพด้วย เนื่องจากไฟล์ที่อัปโหลดทุกไฟล์ถูกบันทึกไว้ คำขอลบจึงมีผลถึงตัวไฟล์ ไม่ใช่เพียงความเห็นที่แนบไฟล์นั้นมา",
        ],
      },
    ],
  },
  en: {
    title: "Privacy Policy",
    updated: "Last updated: 26 August 2026",
    sections: [
      {
        heading: "What we collect",
        body: [
          "Account data: your email address and display name (plus basic profile data if you sign in with Google).",
          "Activity: votes, comments, reactions, reports, submitted topics and their timestamps — used to display the site and to enforce anti-spam limits.",
          "Images you upload: a profile picture, and — where image attachments are enabled — a picture attached to a comment. Every upload is recorded against your account so it can be attributed and removed later. Uploads are re-encoded in your browser before they are sent, which strips embedded camera metadata such as GPS coordinates.",
          "We do not collect payment data and we do not sell your data.",
        ],
      },
      {
        heading: "What is public",
        body: [
          "Your display name, your comments, and the side you picked on topics where you commented are publicly visible. Your email address is never shown to other users.",
          "An image attached to a comment is public too, and it is served from a URL that anyone holding the link can open. Do not attach anything you would not put on a public page. Deleting the comment, removing the image, or having a moderator hide the comment deletes the file from storage.",
        ],
      },
      {
        heading: "Storage and processors",
        body: [
          "Data is stored with third-party database and hosting providers (Supabase and Cloudflare). Images are stored in Cloudflare R2.",
          "We use Cloudflare Web Analytics to count visits. It is cookieless: it stores nothing on your device and does not track you across sites.",
          "Fonts are served by Google Fonts, so when a page loads your browser's request — including its IP address — reaches Google.",
        ],
      },
      {
        heading: "Cookies and browser storage",
        body: [
          "Browser storage is used to keep you signed in, to remember your language choice, and — if you vote without an account — to remember which side you picked on this device. No advertising cookies.",
          "If you vote without an account, we set a cookie holding a random device identifier. It exists so one device counts as one vote per debate and so you can change your mind later. It is not linked to your identity, and it is cleared when you sign in.",
          "To limit automated repeat voting we record a dated hash of your IP address rather than the address itself. The hash changes every day, so it cannot be linked across days.",
          "Our infrastructure providers set a few cookies we do not set ourselves: Cloudflare, which sits in front of the site, sets a short-lived cookie (__cf_bm, about 30 minutes) used to tell automated traffic from human traffic, and our host sets a cookie recording which build served the page (__dpl) so that files loaded afterwards match it, plus a session-scoped flag used for performance measurement.",
          "None of these carry an account or profile identifier.",
        ],
      },
      {
        heading: "Your rights",
        body: [
          "Email hello@toktiang.com to access, correct or delete your account and content. We act on requests within a reasonable time.",
          "That includes images: every uploaded file is recorded, so a deletion request reaches the file itself and not only the comment it was attached to.",
        ],
      },
    ],
  },
};

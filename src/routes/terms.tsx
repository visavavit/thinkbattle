import { createFileRoute } from "@tanstack/react-router";
import { LegalPage, type LegalContent } from "@/components/LegalPage";
import { seoTags } from "@/lib/site";

const TITLE = "ข้อกำหนดการใช้งาน — Terms of Use | toktiang.com";
const DESCRIPTION =
  "Terms of use for toktiang.com: accounts, acceptable content, moderation, and bans.";

export const Route = createFileRoute("/terms")({
  head: () => {
    const seo = seoTags("/terms");
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
    title: "ข้อกำหนดการใช้งาน",
    updated: "ปรับปรุงล่าสุด: 21 สิงหาคม 2026",
    sections: [
      {
        heading: "1. การยอมรับข้อกำหนด",
        body: [
          "การใช้งาน toktiang.com ถือว่าคุณยอมรับข้อกำหนดนี้ หากไม่ยอมรับ กรุณาหยุดใช้งานเว็บไซต์",
        ],
      },
      {
        heading: "2. บัญชีผู้ใช้",
        body: [
          "การโหวตและการแสดงความเห็นต้องสมัครบัญชีด้วยอีเมลหรือบัญชี Google คุณต้องมีอายุอย่างน้อย 13 ปี และรับผิดชอบต่อกิจกรรมทั้งหมดในบัญชีของคุณ",
        ],
      },
      {
        heading: "3. เนื้อหาที่คุณโพสต์",
        body: [
          "คุณยังเป็นเจ้าของเนื้อหาที่โพสต์ และให้สิทธิ์เราแสดง จัดเก็บ และเผยแพร่เนื้อหานั้นบนเว็บไซต์",
          "ห้ามโพสต์: ถ้อยคำสร้างความเกลียดชัง การคุกคาม การข่มขู่ เนื้อหาผิดกฎหมาย ข้อมูลส่วนบุคคลของผู้อื่น สแปม โฆษณา หรือการปลอมตัวเป็นผู้อื่น",
        ],
      },
      {
        heading: "4. การดูแลและการระงับบัญชี",
        body: [
          "ผู้ดูแลอาจซ่อนหรือลบความเห็น ปฏิเสธหัวข้อที่เสนอเข้ามา หรือระงับบัญชีที่ละเมิดข้อกำหนด โดยอาจไม่ได้แจ้งล่วงหน้า",
          "ระบบจำกัดอัตราการโพสต์เพื่อป้องกันสแปม การพยายามหลบเลี่ยงถือเป็นการละเมิดข้อกำหนด",
        ],
      },
      {
        heading: "5. ข้อจำกัดความรับผิด",
        body: [
          "เว็บไซต์ให้บริการ “ตามสภาพ” เนื้อหาส่วนใหญ่มาจากผู้ใช้และไม่ได้สะท้อนความเห็นของเรา เราไม่รับผิดต่อความเสียหายที่เกิดจากการใช้งานเว็บไซต์",
        ],
      },
      {
        heading: "6. การเปลี่ยนแปลง",
        body: ["เราอาจปรับปรุงข้อกำหนดนี้เป็นครั้งคราว การใช้งานต่อถือว่ายอมรับฉบับล่าสุด"],
      },
      {
        heading: "7. ติดต่อ",
        body: ["สอบถามหรือแจ้งปัญหา: hello@toktiang.com"],
      },
    ],
  },
  en: {
    title: "Terms of Use",
    updated: "Last updated: 21 August 2026",
    sections: [
      {
        heading: "1. Acceptance",
        body: ["By using toktiang.com you accept these terms. If you don't, please stop using it."],
      },
      {
        heading: "2. Accounts",
        body: [
          "Voting and commenting require an account created with an email address or Google sign-in. You must be at least 13 years old and are responsible for activity on your account.",
        ],
      },
      {
        heading: "3. Your content",
        body: [
          "You keep ownership of what you post and grant us the right to display, store and distribute it on the site.",
          "Do not post hate speech, harassment, threats, illegal content, other people's private information, spam, advertising, or impersonation.",
        ],
      },
      {
        heading: "4. Moderation and bans",
        body: [
          "Admins may hide or remove comments, reject submitted topics, and ban accounts that break these terms, with or without notice.",
          "Rate limits apply to posting. Attempting to evade them is itself a violation.",
        ],
      },
      {
        heading: "5. Disclaimer",
        body: [
          "The service is provided “as is”. Most content is user-generated and does not represent our views. We are not liable for damages arising from use of the site.",
        ],
      },
      {
        heading: "6. Changes",
        body: ["We may update these terms. Continued use means you accept the current version."],
      },
      {
        heading: "7. Contact",
        body: ["Questions or reports: hello@toktiang.com"],
      },
    ],
  },
};

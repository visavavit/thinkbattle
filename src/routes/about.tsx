import { createFileRoute } from "@tanstack/react-router";
import { LegalPage, type LegalContent } from "@/components/LegalPage";
import { seoTags } from "@/lib/site";

const TITLE = "เกี่ยวกับถกเถียง — About toktiang.com";
const DESCRIPTION =
  "How toktiang.com works and how debates are ranked on toktiang.com.";

export const Route = createFileRoute("/about")({
  head: () => {
    const seo = seoTags("/about");
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
    title: "เกี่ยวกับถกเถียง",
    updated: "ปรับปรุงล่าสุด: 21 สิงหาคม 2026",
    sections: [
      {
        heading: "เราทำอะไร",
        body: [
          "ถกเถียง (toktiang.com) คือเวทีโหวตแบบสองทางเลือก ทุกหัวข้อมีสองฝั่ง คุณเลือกฝั่งหนึ่ง แล้วอธิบายเหตุผลในคอลัมน์ของฝั่งนั้น",
          "ความเห็นถูกจัดอันดับได้หลายแบบ ทั้งยอดนิยม ล่าสุด และ “Wild Takes” ซึ่งดันความเห็นที่คนถูกใจและไม่ถูกใจพอ ๆ กันขึ้นมา เพราะนั่นคือจุดที่การถกเถียงเกิดขึ้นจริง",
        ],
      },
      {
        heading: "การดูแลชุมชน",
        body: [
          "มีระบบจำกัดการโพสต์ถี่ ระบบรายงานความเห็น และผู้ดูแลสามารถซ่อนความเห็นหรือระงับบัญชีที่ละเมิดกติกาได้ รายละเอียดอยู่ในหน้าข้อกำหนดการใช้งาน",
        ],
      },
    ],
  },
  en: {
    title: "About toktiang.com",
    updated: "Last updated: 21 August 2026",
    sections: [
      {
        heading: "What this is",
        body: [
          "toktiang.com is a binary voting arena. Every topic has exactly two sides: pick one, then argue for it in that side's column.",
          "Comments can be ranked by top, newest, or “Wild Takes” — the ranking that surfaces comments people liked and disliked in roughly equal measure, because that is where the actual debate is.",
        ],
      },
      {
        heading: "Moderation",
        body: [
          "Rate limits, comment reporting, and admin tools for hiding comments or banning accounts all apply. The details live in the Terms of Use.",
        ],
      },
    ],
  },
};

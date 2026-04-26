<script setup>
/**
 * DocsView — static documentation page for the `kurrasah` package.
 *
 * This is a sibling route to `/`, not another document. It is a
 * consumer-side reference — the editor package itself is untouched.
 * At the bottom, a readonly `<Editor>` instance renders a preset
 * markdown source that exercises every v1 construct so readers can
 * see the actual rendered output (and confirm the package works) in
 * the same visual language as the live editor.
 *
 * Nav back is provided both by the header (logo / app name is a
 * router-link to `/`) and by a subtle footer link at the bottom of
 * this page.
 */

import { ref } from 'vue'
import { Editor } from 'kurrasah'
import 'kurrasah/style.css'

const GITHUB_URL = 'https://github.com/mohanadkaleia/kurrasah'

// Preset markdown for the readonly live preview. Exercises every v1
// construct: h1/h2/h3, paragraph with bold / italic / link / inline
// code, bullet + ordered lists, blockquote, code block, and an image
// (via a harmless placeholder service that returns a small PNG).
const previewMarkdown = ref(`# مرحباً بك في المحرر

هذا **عرض مباشر** لما يقدّمه \`kurrasah\`. جرّب التمرير والقراءة — كلّ ما تراه هنا مُنتَج بواسطة المحرر نفسه في وضع *القراءة فقط*.

في وضع التحرير، يمكنك الضغط على \`@\` أو \`Cmd+K\` لفتح قائمة اختيار نوع الكتلة (فقرة، عنوان، قائمة، اقتباس، كتلة شيفرة، صورة). جرّب كتابة \`@\` في أوّل سطر فارغ لفتح قائمة الكتل.

## ميزات v1

- فقرات ونصوص RTL افتراضياً
- عناوين من المستوى الأول إلى الثالث
- قوائم نقطية ورقمية
- اقتباسات مميّزة بشريط جانبي
- كتل شيفرة برمجية
- روابط وصور

### أمثلة سريعة

نصّ مع **عريض** و *مائل* ورابط إلى [مستودع المشروع](https://github.com/mohanadkaleia/kurrasah) وكذلك \`شيفرة سطريّة\` داخل الفقرة.

1. العنصر الأول
2. العنصر الثاني
3. العنصر الثالث

> اقتباس قصير لإظهار الشريط الجانبي الأزرق والنصّ الرمادي المائل.

\`\`\`js
// كتلة شيفرة — تبقى بالاتجاه LTR.
import { Editor } from 'kurrasah'
import 'kurrasah/style.css'

export default { components: { Editor } }
\`\`\`

### جداول

| الاسم | الوصف |
|-------|-------|
| أبجد  | حرف   |
| هوّز  | حرف   |

![صورة توضيحية](https://placehold.co/600x240/f9fafb/111827?text=Editor)
`)
</script>

<template>
  <main
    class="flex-1 w-full"
    data-testid="docs-page"
    dir="rtl"
  >
    <article class="max-w-3xl mx-auto px-6 py-12 md:py-16 editor-canvas">
      <!-- Hero --------------------------------------------------------- -->
      <header class="mb-12">
        <h1
          class="text-[2.25rem] leading-tight font-semibold tracking-tight text-text-primary mb-4"
          data-testid="docs-hero-title"
        >
          محرر النصوص — دليل الاستخدام
        </h1>
        <p class="text-text-secondary leading-relaxed">
          حزمة <code class="font-mono">kurrasah</code> هي محرر نصوص
          قابل لإعادة الاستخدام مبني على Vue 3 وProseMirror، بإعدادات
          RTL افتراضياً. المحرر مستقلّ تماماً عن أي خادم أو تخزين —
          يأخذ Markdown ويُخرج Markdown، لا أكثر.
        </p>
      </header>

      <!-- 2. Installation --------------------------------------------- -->
      <section class="mb-12" data-testid="docs-section-install">
        <h2
          class="text-[1.5rem] font-semibold text-text-primary mt-0 mb-3"
        >
          التثبيت
        </h2>
        <p class="text-text-secondary leading-relaxed mb-4">
          الحزمة منشورة على
          <a
            href="https://www.npmjs.com/package/kurrasah"
            target="_blank"
            rel="noopener noreferrer"
            class="underline underline-offset-2 hover:text-text-primary"
          >npm</a>.
          ثبّتها عبر مدير الحزم المفضّل:
        </p>

        <div class="mb-2">
          <div
            class="flex items-center gap-2 px-3 py-1.5 text-xs font-mono text-text-secondary bg-surface border border-border border-b-0 rounded-t-lg"
            dir="ltr"
          >
            <i class="fa-solid fa-terminal text-text-secondary"></i>
            <span>shell</span>
          </div>
          <pre
            class="!mt-0 !rounded-t-none"
            dir="ltr"
          ><code>npm install kurrasah</code></pre>
        </div>
      </section>

      <!-- 3. Basic usage ---------------------------------------------- -->
      <section class="mb-12" data-testid="docs-section-usage">
        <h2 class="text-[1.5rem] font-semibold text-text-primary mt-0 mb-3">
          الاستخدام الأساسي
        </h2>
        <p class="text-text-secondary leading-relaxed mb-4">
          استورد المكوّن، وربط <code class="font-mono">v-model</code>
          بمتغيّر من نوع Markdown:
        </p>
        <div>
          <div
            class="flex items-center gap-2 px-3 py-1.5 text-xs font-mono text-text-secondary bg-surface border border-border border-b-0 rounded-t-lg"
            dir="ltr"
          >
            <i class="fa-brands fa-vuejs text-text-secondary"></i>
            <span>MyEditor.vue</span>
          </div>
          <pre
            class="!mt-0 !rounded-t-none"
            dir="ltr"
          ><code>&lt;script setup&gt;
import { ref } from 'vue'
import { Editor } from 'kurrasah'
import 'kurrasah/style.css'

const markdown = ref('# مرحبا')
&lt;/script&gt;

&lt;template&gt;
  &lt;Editor v-model="markdown" dir="rtl" /&gt;
&lt;/template&gt;</code></pre>
        </div>
      </section>

      <!-- 4. Props ---------------------------------------------------- -->
      <section id="docs-section-props" class="mb-12" data-testid="docs-section-props">
        <h2 class="text-[1.5rem] font-semibold text-text-primary mt-0 mb-3">
          الخصائص (Props)
        </h2>
        <div class="overflow-x-auto border border-border rounded-lg">
          <table class="w-full text-sm">
            <thead class="bg-surface text-text-secondary">
              <tr>
                <th class="text-right font-medium px-4 py-2 border-b border-border">الخاصية</th>
                <th class="text-right font-medium px-4 py-2 border-b border-border">النوع</th>
                <th class="text-right font-medium px-4 py-2 border-b border-border">الافتراضي</th>
                <th class="text-right font-medium px-4 py-2 border-b border-border">الوصف</th>
              </tr>
            </thead>
            <tbody class="text-text-primary">
              <tr>
                <td class="px-4 py-2 border-b border-border font-mono" dir="ltr">modelValue</td>
                <td class="px-4 py-2 border-b border-border font-mono" dir="ltr">string</td>
                <td class="px-4 py-2 border-b border-border font-mono" dir="ltr">''</td>
                <td class="px-4 py-2 border-b border-border">مصدر Markdown المرتبط بـ <span class="font-mono" dir="ltr">v-model</span></td>
              </tr>
              <tr>
                <td class="px-4 py-2 border-b border-border font-mono" dir="ltr">dir</td>
                <td class="px-4 py-2 border-b border-border font-mono" dir="ltr">'rtl' | 'ltr'</td>
                <td class="px-4 py-2 border-b border-border font-mono" dir="ltr">'rtl'</td>
                <td class="px-4 py-2 border-b border-border">اتجاه الكتابة</td>
              </tr>
              <tr>
                <td class="px-4 py-2 border-b border-border font-mono" dir="ltr">images</td>
                <td class="px-4 py-2 border-b border-border font-mono" dir="ltr">boolean</td>
                <td class="px-4 py-2 border-b border-border font-mono" dir="ltr">true</td>
                <td class="px-4 py-2 border-b border-border">تفعيل دعم الصور</td>
              </tr>
              <tr>
                <td class="px-4 py-2 border-b border-border font-mono" dir="ltr">links</td>
                <td class="px-4 py-2 border-b border-border font-mono" dir="ltr">boolean</td>
                <td class="px-4 py-2 border-b border-border font-mono" dir="ltr">true</td>
                <td class="px-4 py-2 border-b border-border">تفعيل دعم الروابط</td>
              </tr>
              <tr>
                <td class="px-4 py-2 border-b border-border font-mono" dir="ltr">placeholder</td>
                <td class="px-4 py-2 border-b border-border font-mono" dir="ltr">string</td>
                <td class="px-4 py-2 border-b border-border font-mono" dir="ltr">''</td>
                <td class="px-4 py-2 border-b border-border">نصّ يظهر حين يكون المستند فارغاً</td>
              </tr>
              <tr>
                <td class="px-4 py-2 border-b border-border font-mono" dir="ltr">readonly</td>
                <td class="px-4 py-2 border-b border-border font-mono" dir="ltr">boolean</td>
                <td class="px-4 py-2 border-b border-border font-mono" dir="ltr">false</td>
                <td class="px-4 py-2 border-b border-border">تعطيل التحرير (وضع القراءة فقط)</td>
              </tr>
              <tr>
                <td class="px-4 py-2 border-b border-border font-mono" dir="ltr">toolbar</td>
                <td class="px-4 py-2 border-b border-border font-mono" dir="ltr">boolean | 'minimal'</td>
                <td class="px-4 py-2 border-b border-border font-mono" dir="ltr">'minimal'</td>
                <td class="px-4 py-2 border-b border-border">نمط شريط الأدوات المضمَّن</td>
              </tr>
              <tr>
                <td class="px-4 py-2 border-b border-border font-mono" dir="ltr">slashTrigger</td>
                <td class="px-4 py-2 border-b border-border font-mono" dir="ltr">string</td>
                <td class="px-4 py-2 border-b border-border font-mono" dir="ltr">'@'</td>
                <td class="px-4 py-2 border-b border-border">الحرف الذي يفتح قائمة اختيار نوع الكتلة. افتراضيّاً <span class="font-mono" dir="ltr">@</span> لأن <span class="font-mono" dir="ltr">/</span> يقع على حرف <span class="font-mono">ظ</span> في لوحة المفاتيح العربية.</td>
              </tr>
              <tr>
                <td class="px-4 py-2 border-b border-border font-mono" dir="ltr">slashEnabled</td>
                <td class="px-4 py-2 border-b border-border font-mono" dir="ltr">boolean</td>
                <td class="px-4 py-2 border-b border-border font-mono" dir="ltr">true</td>
                <td class="px-4 py-2 border-b border-border">تفعيل قائمة الكتل. عند <span class="font-mono" dir="ltr">false</span> يعود <span class="font-mono" dir="ltr">Cmd/Ctrl+K</span> إلى أمر الرابط.</td>
              </tr>
              <tr>
                <td class="px-4 py-2 border-b border-border font-mono" dir="ltr">blockControlsEnabled</td>
                <td class="px-4 py-2 border-b border-border font-mono" dir="ltr">boolean</td>
                <td class="px-4 py-2 border-b border-border font-mono" dir="ltr">true</td>
                <td class="px-4 py-2 border-b border-border">إظهار زر <span class="font-mono" dir="ltr">+</span> عند تمرير المؤشّر فوق فقرة فارغة. راجع <a href="#docs-section-empty-plus" class="underline underline-offset-2 hover:text-accent-hover">زر + للأسطر الفارغة</a>.</td>
              </tr>
              <tr>
                <td class="px-4 py-2 border-b border-border font-mono" dir="ltr">tableToolbarEnabled</td>
                <td class="px-4 py-2 border-b border-border font-mono" dir="ltr">boolean</td>
                <td class="px-4 py-2 border-b border-border font-mono" dir="ltr">true</td>
                <td class="px-4 py-2 border-b border-border">إظهار شريط الأدوات العائم لإجراءات الجدول (إضافة/حذف الأسطر والأعمدة، حذف الجدول) حين يكون المؤشّر داخل خليّة. مرّر <span class="font-mono" dir="ltr">false</span> لإيقافه.</td>
              </tr>
              <tr>
                <td class="px-4 py-2 border-b border-border font-mono" dir="ltr">onRequestLink</td>
                <td class="px-4 py-2 border-b border-border font-mono" dir="ltr">(context) =&gt; Promise&lt;{href, title?} | null&gt; | null</td>
                <td class="px-4 py-2 border-b border-border font-mono" dir="ltr">null</td>
                <td class="px-4 py-2 border-b border-border">دالة اختيارية تستدعيها الحزمة حين يحتاج أمر الرابط إلى <span class="font-mono" dir="ltr">URL</span>. أعِد <span class="font-mono" dir="ltr">null</span> للإلغاء. في حال عدم تمريرها، يعود المحرر إلى <span class="font-mono" dir="ltr">window.prompt</span> بالإنجليزية.</td>
              </tr>
              <tr>
                <td class="px-4 py-2 border-b border-border font-mono" dir="ltr">onRequestImage</td>
                <td class="px-4 py-2 border-b border-border font-mono" dir="ltr">(context) =&gt; Promise&lt;{src, alt?, title?} | null&gt; | null</td>
                <td class="px-4 py-2 border-b border-border font-mono" dir="ltr">null</td>
                <td class="px-4 py-2 border-b border-border">مثل <span class="font-mono" dir="ltr">onRequestLink</span>، لكن لأمر إدراج الصور (قائمة الكتل / شريط الأدوات).</td>
              </tr>
              <tr>
                <td class="px-4 py-2 font-mono" dir="ltr">onUploadImage</td>
                <td class="px-4 py-2 font-mono" dir="ltr">(file, {source: 'drop' | 'paste'}) =&gt; Promise&lt;{src, alt?, title?} | null&gt; | null</td>
                <td class="px-4 py-2 font-mono" dir="ltr">null</td>
                <td class="px-4 py-2">دالة اختيارية تستدعيها الحزمة عند سحب صورة وإفلاتها على المحرّر أو لصقها من الحافظة. نفّذ عملية الرفع وأعِد <span class="font-mono" dir="ltr">{src, alt?, title?}</span>، أو <span class="font-mono" dir="ltr">null</span> للإلغاء. راجع <a href="#docs-section-image-upload" class="underline underline-offset-2 hover:text-accent-hover">رفع الصور</a>.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- 5. Events --------------------------------------------------- -->
      <section class="mb-12" data-testid="docs-section-events">
        <h2 class="text-[1.5rem] font-semibold text-text-primary mt-0 mb-3">
          الأحداث (Events)
        </h2>
        <div class="overflow-x-auto border border-border rounded-lg">
          <table class="w-full text-sm">
            <thead class="bg-surface text-text-secondary">
              <tr>
                <th class="text-right font-medium px-4 py-2 border-b border-border">الحدث</th>
                <th class="text-right font-medium px-4 py-2 border-b border-border">الحمولة</th>
                <th class="text-right font-medium px-4 py-2 border-b border-border">الوصف</th>
              </tr>
            </thead>
            <tbody class="text-text-primary">
              <tr>
                <td class="px-4 py-2 border-b border-border font-mono" dir="ltr">update:modelValue</td>
                <td class="px-4 py-2 border-b border-border font-mono" dir="ltr">md: string</td>
                <td class="px-4 py-2 border-b border-border">يُطلق عند تغيّر المحتوى (يدعم <span class="font-mono" dir="ltr">v-model</span>)</td>
              </tr>
              <tr>
                <td class="px-4 py-2 border-b border-border font-mono" dir="ltr">change</td>
                <td class="px-4 py-2 border-b border-border font-mono" dir="ltr">md: string</td>
                <td class="px-4 py-2 border-b border-border">مرادف لـ <span class="font-mono" dir="ltr">update:modelValue</span> للمستهلكين الذين لا يستخدمون <span class="font-mono" dir="ltr">v-model</span></td>
              </tr>
              <tr>
                <td class="px-4 py-2 font-mono" dir="ltr">ready</td>
                <td class="px-4 py-2 font-mono" dir="ltr">view: EditorView</td>
                <td class="px-4 py-2">يُطلق عند التهيئة الأولى وبعد كل إعادة بناء داخلية (مثلاً عند تبديل <span class="font-mono" dir="ltr">images</span> أو <span class="font-mono" dir="ltr">links</span>) — المستهلكون الذين يحتفظون بمرجع طويل الأمد لـ <span class="font-mono" dir="ltr">EditorView</span> يجب أن يُحدّثوه مع كل إطلاق.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- 6. Exposed methods ----------------------------------------- -->
      <section class="mb-12" data-testid="docs-section-methods">
        <h2 class="text-[1.5rem] font-semibold text-text-primary mt-0 mb-3">
          الدوال المُعرَّضة (Exposed methods)
        </h2>
        <p class="text-text-secondary leading-relaxed mb-4">
          عبر <span class="font-mono" dir="ltr">ref</span> على المكوّن:
        </p>
        <div class="overflow-x-auto border border-border rounded-lg">
          <table class="w-full text-sm">
            <thead class="bg-surface text-text-secondary">
              <tr>
                <th class="text-right font-medium px-4 py-2 border-b border-border">الدالة</th>
                <th class="text-right font-medium px-4 py-2 border-b border-border">التوقيع</th>
                <th class="text-right font-medium px-4 py-2 border-b border-border">الوصف</th>
              </tr>
            </thead>
            <tbody class="text-text-primary">
              <tr>
                <td class="px-4 py-2 border-b border-border font-mono" dir="ltr">focus</td>
                <td class="px-4 py-2 border-b border-border font-mono" dir="ltr">focus(): void</td>
                <td class="px-4 py-2 border-b border-border">ينقل التركيز إلى سطح التحرير</td>
              </tr>
              <tr>
                <td class="px-4 py-2 border-b border-border font-mono" dir="ltr">getMarkdown</td>
                <td class="px-4 py-2 border-b border-border font-mono" dir="ltr">getMarkdown(): string</td>
                <td class="px-4 py-2 border-b border-border">يُعيد المحتوى الحالي كسلسلة Markdown</td>
              </tr>
              <tr>
                <td class="px-4 py-2 border-b border-border font-mono" dir="ltr">setMarkdown</td>
                <td class="px-4 py-2 border-b border-border font-mono" dir="ltr">setMarkdown(md: string): void</td>
                <td class="px-4 py-2 border-b border-border">يستبدل المحتوى بالكامل بـ Markdown المُمرَّر</td>
              </tr>
              <tr>
                <td class="px-4 py-2 font-mono" dir="ltr">execCommand</td>
                <td class="px-4 py-2 font-mono" dir="ltr">execCommand(name, ...args): boolean</td>
                <td class="px-4 py-2">ينفّذ أمراً مُسمّى على المحرر، ويعيد <span class="font-mono" dir="ltr">true</span> إن نجح</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- 7. Supported content --------------------------------------- -->
      <section class="mb-12" data-testid="docs-section-content">
        <h2 class="text-[1.5rem] font-semibold text-text-primary mt-0 mb-3">
          المحتوى المدعوم
        </h2>

        <h3 class="text-[1.25rem] font-semibold text-text-primary mt-6 mb-2">
          العُقد (Nodes) — v1
        </h3>
        <ul class="list-disc pr-6 text-text-secondary leading-relaxed space-y-1">
          <li>فقرة (<span class="font-mono" dir="ltr">paragraph</span>)</li>
          <li>عناوين من المستوى 1 إلى 3 (<span class="font-mono" dir="ltr">heading</span>)</li>
          <li>قائمة نقطية (<span class="font-mono" dir="ltr">bullet list</span>)</li>
          <li>قائمة مرقّمة (<span class="font-mono" dir="ltr">ordered list</span>)</li>
          <li>اقتباس (<span class="font-mono" dir="ltr">blockquote</span>)</li>
          <li>كتلة شيفرة (<span class="font-mono" dir="ltr">code block</span>)</li>
          <li>فاصل سطر (<span class="font-mono" dir="ltr">hard break</span>)</li>
          <li>صورة (<span class="font-mono" dir="ltr">image</span>)</li>
          <li>جدول (<span class="font-mono" dir="ltr">table</span>) — بصياغة GFM، مع تنقّل عبر <span class="font-mono" dir="ltr">Tab</span> / <span class="font-mono" dir="ltr">Shift-Tab</span> وشريط أدوات لإدارة الصفوف والأعمدة</li>
        </ul>

        <h3 class="text-[1.25rem] font-semibold text-text-primary mt-6 mb-2">
          العلامات (Marks) — v1
        </h3>
        <ul class="list-disc pr-6 text-text-secondary leading-relaxed space-y-1">
          <li>عريض (<span class="font-mono" dir="ltr">bold</span>)</li>
          <li>مائل (<span class="font-mono" dir="ltr">italic</span>)</li>
          <li>رابط (<span class="font-mono" dir="ltr">link</span>)</li>
          <li>شيفرة سطريّة (<span class="font-mono" dir="ltr">inline code</span>)</li>
        </ul>
      </section>

      <!-- 8. Keyboard shortcuts -------------------------------------- -->
      <section class="mb-12" data-testid="docs-section-shortcuts">
        <h2 class="text-[1.5rem] font-semibold text-text-primary mt-0 mb-3">
          اختصارات لوحة المفاتيح
        </h2>
        <div class="overflow-x-auto border border-border rounded-lg">
          <table class="w-full text-sm">
            <thead class="bg-surface text-text-secondary">
              <tr>
                <th class="text-right font-medium px-4 py-2 border-b border-border">الاختصار</th>
                <th class="text-right font-medium px-4 py-2 border-b border-border">الوظيفة</th>
              </tr>
            </thead>
            <tbody class="text-text-primary">
              <tr>
                <td class="px-4 py-2 border-b border-border font-mono" dir="ltr">Mod-B</td>
                <td class="px-4 py-2 border-b border-border">تبديل العريض</td>
              </tr>
              <tr>
                <td class="px-4 py-2 border-b border-border font-mono" dir="ltr">Mod-I</td>
                <td class="px-4 py-2 border-b border-border">تبديل المائل</td>
              </tr>
              <tr>
                <td class="px-4 py-2 border-b border-border font-mono" dir="ltr">Mod-`</td>
                <td class="px-4 py-2 border-b border-border">تبديل الشيفرة السطريّة</td>
              </tr>
              <tr>
                <td class="px-4 py-2 border-b border-border font-mono" dir="ltr">Mod-K (Cmd/Ctrl+K)</td>
                <td class="px-4 py-2 border-b border-border">حين يكون النصّ محدّداً: تبديل رابط. حين تكون الخلية فارغة: فتح قائمة الكتل (وضع palette) — بديل لإدخال <span class="font-mono" dir="ltr">@</span>.</td>
              </tr>
              <tr>
                <td class="px-4 py-2 border-b border-border font-mono" dir="ltr">Shift-Ctrl-1 / 2 / 3</td>
                <td class="px-4 py-2 border-b border-border">عنوان بمستوى 1 / 2 / 3</td>
              </tr>
              <tr>
                <td class="px-4 py-2 border-b border-border font-mono" dir="ltr">Ctrl-&gt;</td>
                <td class="px-4 py-2 border-b border-border">اقتباس</td>
              </tr>
              <tr>
                <td class="px-4 py-2 border-b border-border font-mono" dir="ltr">Shift-Ctrl-8</td>
                <td class="px-4 py-2 border-b border-border">قائمة نقطيّة</td>
              </tr>
              <tr>
                <td class="px-4 py-2 border-b border-border font-mono" dir="ltr">Shift-Ctrl-9</td>
                <td class="px-4 py-2 border-b border-border">قائمة مرقّمة</td>
              </tr>
              <tr>
                <td class="px-4 py-2 border-b border-border font-mono" dir="ltr">Tab / Shift-Tab</td>
                <td class="px-4 py-2 border-b border-border">
                  إدخال / إخراج عنصر قائمة.
                  <span class="block">داخل جدول: الانتقال إلى الخلية التالية / السابقة (يُنشئ صفاً جديداً إذا تجاوز الخلية الأخيرة).</span>
                </td>
              </tr>
              <tr>
                <td class="px-4 py-2 border-b border-border font-mono" dir="ltr">Enter (×2) داخل كتلة الشيفرة</td>
                <td class="px-4 py-2 border-b border-border">الخروج من كتلة الشيفرة وإدراج فقرة جديدة بعدها. <span class="font-mono" dir="ltr">Mod-Enter</span> يخرج فوراً.</td>
              </tr>
              <tr>
                <td class="px-4 py-2 border-b border-border font-mono" dir="ltr">Mod-Enter</td>
                <td class="px-4 py-2 border-b border-border">الخروج من كتلة الشيفرة</td>
              </tr>
              <tr>
                <td class="px-4 py-2 font-mono" dir="ltr">Mod-Z / Shift-Mod-Z</td>
                <td class="px-4 py-2">تراجع / إعادة</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- 9. Input rules --------------------------------------------- -->
      <section class="mb-12" data-testid="docs-section-rules">
        <h2 class="text-[1.5rem] font-semibold text-text-primary mt-0 mb-3">
          قواعد الإدخال
        </h2>
        <p class="text-text-secondary leading-relaxed mb-3">
          يمكنك الكتابة مباشرة بقواعد Markdown شائعة ويُطبّقها المحرر
          تلقائياً:
        </p>
        <ul class="list-disc pr-6 text-text-secondary leading-relaxed space-y-1">
          <li><code class="font-mono" dir="ltr"># </code>، <code class="font-mono" dir="ltr">## </code>، <code class="font-mono" dir="ltr">### </code> — عنوان بمستوى 1 / 2 / 3</li>
          <li><code class="font-mono" dir="ltr">- </code> أو <code class="font-mono" dir="ltr">* </code> — قائمة نقطيّة</li>
          <li><code class="font-mono" dir="ltr">1. </code> — قائمة مرقّمة</li>
          <li><code class="font-mono" dir="ltr">&gt; </code> — اقتباس</li>
          <li><code class="font-mono" dir="ltr">```</code> — كتلة شيفرة</li>
          <li><code class="font-mono" dir="ltr">**x**</code> — عريض</li>
          <li><code class="font-mono" dir="ltr">*x*</code> — مائل</li>
          <li><code class="font-mono" dir="ltr">`x`</code> — شيفرة سطريّة</li>
        </ul>
      </section>

      <!-- 10. Slash menu --------------------------------------------- -->
      <section class="mb-12" data-testid="docs-section-slash-menu">
        <h2 class="text-[1.5rem] font-semibold text-text-primary mt-0 mb-3">
          قائمة الكتل (Slash menu)
        </h2>
        <p class="text-text-secondary leading-relaxed mb-3">
          تُفتح القائمة عند كتابة <span class="font-mono" dir="ltr">@</span>
          في بداية سطر فارغ أو بعد مسافة، أو بالضغط على
          <span class="font-mono" dir="ltr">Cmd/Ctrl+K</span> والمؤشّر في
          خلية فارغة. يتحدّث الفلتر مباشرة مع كل حرف تكتبه، ويُغلق الضغط
          على مسافة القائمة.
        </p>
        <p class="text-text-secondary leading-relaxed mb-3">
          كل عنصر في القائمة يقبل أسماء مستعارة بالإنجليزية والعربية
          معاً — فـ <span class="font-mono" dir="ltr">@h1</span> يُكافئ
          <span class="font-mono" dir="ltr">@عنوان</span>، و
          <span class="font-mono" dir="ltr">@list</span> يُكافئ
          <span class="font-mono" dir="ltr">@قائمة</span>، وهكذا لسائر
          الكتل (اقتباس، كتلة شيفرة، صورة…).
        </p>
        <p class="text-text-secondary leading-relaxed mb-3">
          اختير الحرف <span class="font-mono" dir="ltr">@</span> بديلاً
          عن <span class="font-mono" dir="ltr">/</span> لأنّ الأخير يُنتج
          <span class="font-mono">ظ</span> على لوحة المفاتيح العربية
          القياسية، فيتعارض مع الكتابة الطبيعية. أما
          <span class="font-mono" dir="ltr">@</span> فيقع على الموضع نفسه
          في التخطيطين (<span class="font-mono" dir="ltr">Shift+2</span>)
          ولا يَرِد في النثر العربي.
        </p>
        <p class="text-text-secondary leading-relaxed">
          للتخصيص، راجع الخاصيتين
          <span class="font-mono" dir="ltr">slashTrigger</span> و
          <span class="font-mono" dir="ltr">slashEnabled</span> في
          <a href="#docs-section-props" class="underline underline-offset-2 hover:text-accent-hover">جدول الخصائص</a>.
        </p>
      </section>

      <!-- 11. Empty-line + button ------------------------------------ -->
      <section id="docs-section-empty-plus" class="mb-12" data-testid="docs-section-empty-plus">
        <h2 class="text-[1.5rem] font-semibold text-text-primary mt-0 mb-3">
          زر + للأسطر الفارغة
        </h2>
        <p class="text-text-secondary leading-relaxed mb-3">
          عند تمرير المؤشّر فوق <strong>فقرة فارغة</strong>، يظهر زر
          <span class="font-mono" dir="ltr">+</span> صغير على حافة بداية
          الكتلة — اليمين في
          <span class="font-mono" dir="ltr">dir="rtl"</span>، واليسار في
          <span class="font-mono" dir="ltr">dir="ltr"</span>. الضغط عليه
          يضع المؤشّر داخل الفقرة ويفتح قائمة الكتل في وضع لوحة الأوامر
          (command palette)، فيتحوّل نوع الكتلة التي فوقها المؤشّر
          <strong>في مكانها</strong> — دون إدراج سطر جديد.
        </p>
        <p class="text-text-secondary leading-relaxed mb-3">
          الكتل المُعبَّأة (فقرات فيها نصّ، عناوين، قوائم، اقتباسات،
          كتل شيفرة) لا يظهر عليها الزرّ — للحفاظ على هدوء سطح القراءة.
        </p>
        <p class="text-text-secondary leading-relaxed">
          لإيقاف الزرّ كليّاً مرّر
          <span class="font-mono" dir="ltr">blockControlsEnabled="false"</span>
          على <span class="font-mono" dir="ltr">&lt;Editor&gt;</span>.
        </p>
      </section>

      <!-- 12. Link click behavior ------------------------------------ -->
      <section class="mb-12" data-testid="docs-section-link-clicks">
        <h2 class="text-[1.5rem] font-semibold text-text-primary mt-0 mb-3">
          سلوك النقر على الروابط
        </h2>
        <ul class="list-disc pr-6 text-text-secondary leading-relaxed space-y-1 mb-3">
          <li>
            نقرة عادية على الرابط → يُفتح الرابط في تبويب جديد (في
            وضعَي التحرير والقراءة فقط).
          </li>
          <li>
            <span class="font-mono" dir="ltr">Cmd/Ctrl+click</span> →
            يضع المؤشّر داخل الرابط لتعديل النصّ المُرتبط به.
          </li>
        </ul>
        <p class="text-text-secondary leading-relaxed">
          يتوافق هذا السلوك مع ما يتوقّعه المستخدمون من محرّرات مثل
          Medium وSubstack: النقرة الاعتيادية تعني «تَنَقَّل»، لا
          «حرِّر».
        </p>
      </section>

      <!-- 12.5 Image upload (drop / paste) -------------------------- -->
      <section
        id="docs-section-image-upload"
        class="mb-12"
        data-testid="docs-section-image-upload"
      >
        <h2 class="text-[1.5rem] font-semibold text-text-primary mt-0 mb-3">
          رفع الصور (سحب وإفلات / لصق)
        </h2>
        <p class="text-text-secondary leading-relaxed mb-3">
          إلى جانب مسار <span class="font-mono" dir="ltr">onRequestImage</span>
          الذي يَطلب رابط <span class="font-mono" dir="ltr">URL</span> من
          المستخدم (عبر قائمة الكتل أو شريط الأدوات)، يدعم المحرّر مساراً
          ثانياً يلتقط <strong>الملفّات</strong>: عند سحب صورة وإفلاتها فوق
          سطح التحرير أو لصق صورة من الحافظة، تستدعى الدالة
          <span class="font-mono" dir="ltr">onUploadImage</span> مع
          <span class="font-mono" dir="ltr">(file, {source})</span> حيث
          <span class="font-mono" dir="ltr">source</span> إمّا
          <span class="font-mono" dir="ltr">'drop'</span> أو
          <span class="font-mono" dir="ltr">'paste'</span>. تتولّى أنت رفع
          الملف إلى الخادم وتُرجع <span class="font-mono" dir="ltr">src</span>
          النهائي ليُدرج في المستند.
        </p>
        <p class="text-text-secondary leading-relaxed mb-3">
          إذا لم تُمرّر <span class="font-mono" dir="ltr">onUploadImage</span>،
          يَترك المحرّر السلوك الافتراضي للمتصفّح كما هو ولا يتدخّل. أمّا
          المسار القديم (<span class="font-mono" dir="ltr">onRequestImage</span>
          عبر قائمة الكتل / شريط الأدوات) فيبقى يعمل دون تغيير — المسارَين
          مُكمِّلان.
        </p>
        <p class="text-text-secondary leading-relaxed mb-3">
          المثال أدناه يستخدم <span class="font-mono" dir="ltr">FileReader</span>
          لتضمين الصورة كـ <span class="font-mono" dir="ltr">data URL</span> —
          مفيد للعروض التوضيحية أو الحالات المحدودة. للنشر الفعلي، استبدل
          هذا بنداء <span class="font-mono" dir="ltr">fetch</span> إلى
          خدمة التخزين لديك.
        </p>
        <pre dir="ltr"><code class="text-sm font-mono leading-relaxed">async function uploadImage(file, { source }) {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () =&gt; {
      resolve({ src: String(reader.result), alt: file.name })
    }
    reader.onerror = () =&gt; resolve(null)
    reader.readAsDataURL(file)
  })
}</code></pre>
        <p class="text-text-secondary leading-relaxed mt-3">
          ملاحظات:
        </p>
        <ul class="list-disc pr-6 text-text-secondary leading-relaxed space-y-1 mb-3">
          <li>
            تُستدعى الدالة مرّة لكلّ ملفّ. إفلات عدّة ملفّات دفعةً واحدة يُدرج
            صور متعدّدة بالترتيب.
          </li>
          <li>
            إعادة <span class="font-mono" dir="ltr">null</span> تُلغي الإدراج
            دون أن يَعود المتصفّح لتصرّفه الافتراضي (لا يفتح الصورة في تبويب،
            ولا يُلصِقها كنصّ).
          </li>
          <li>
            الأخطاء المُلتقَطة من الدالة (سواء استثناءات أو وعود مرفوضة)
            تُسجَّل في <span class="font-mono" dir="ltr">console.error</span>
            ببادئة <span class="font-mono" dir="ltr">[kurrasah]</span> ولا
            تتسبّب في انهيار المحرّر.
          </li>
        </ul>
      </section>

      <!-- 13. Live preview ------------------------------------------- -->
      <section class="mb-12" data-testid="docs-section-preview">
        <h2 class="text-[1.5rem] font-semibold text-text-primary mt-0 mb-3">
          معاينة مباشرة
        </h2>
        <p class="text-text-secondary leading-relaxed mb-4">
          هذا محرر حقيقي بوضع القراءة فقط — ما تراه أدناه هو كيف يتصرّف
          المحرر فعلياً.
        </p>
        <div
          class="border border-border rounded-lg bg-white p-6 md:p-8"
          data-testid="docs-preview-surface"
        >
          <Editor
            v-model="previewMarkdown"
            :dir="'rtl'"
            :images="true"
            :links="true"
            :readonly="true"
            :toolbar="false"
          />
        </div>
      </section>

      <!-- 14. Links --------------------------------------------------- -->
      <section class="mb-16" data-testid="docs-section-links">
        <h2 class="text-[1.5rem] font-semibold text-text-primary mt-0 mb-3">
          الرابط
        </h2>
        <ul class="list-disc pr-6 text-text-secondary leading-relaxed space-y-1">
          <li>
            المستودع على GitHub:
            <a
              :href="GITHUB_URL"
              target="_blank"
              rel="noopener"
              class="font-mono text-text-primary underline underline-offset-2 hover:text-accent-hover"
              dir="ltr"
            >{{ GITHUB_URL }}</a>
          </li>
        </ul>
      </section>

      <!-- Nav back ---------------------------------------------------- -->
      <div class="pt-6 border-t border-border">
        <router-link
          to="/"
          class="text-sm text-text-secondary hover:text-text-primary hover:underline underline-offset-4 transition-colors"
          data-testid="docs-back-link"
        >
          ← العودة إلى المحرر
        </router-link>
      </div>
    </article>
  </main>
</template>

<style scoped>
/*
 * Page-level code block styling.
 *
 * The `.editor-canvas .editor-content` overrides in `web/src/style.css`
 * only apply inside the live ProseMirror surface — they don't reach
 * raw <pre> blocks in the static documentation. So we define a small
 * parallel look here: same gray surface, border, radius, mono font,
 * rounded-top only when a filename header bar sits above the block.
 */
.editor-canvas pre {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 1rem;
  overflow-x: auto;
  font-family: var(--font-mono);
  font-size: 0.875rem;
  color: var(--color-text-primary);
  line-height: 1.6;
  margin: 0;
}

.editor-canvas pre code {
  font-family: inherit;
  font-size: inherit;
  color: inherit;
  background: none;
  padding: 0;
  border-radius: 0;
}

/* Inline code inside prose (not inside <pre>). Matches the pink chip
   the live editor uses, so the two surfaces read the same. */
.editor-canvas :not(pre) > code {
  color: #f43f5e;
  background: rgba(244, 63, 94, 0.1);
  padding: 0.2rem 0.4rem;
  border-radius: 4px;
  font-family: var(--font-mono);
  font-size: 0.875rem;
}
</style>

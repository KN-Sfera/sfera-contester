import Markdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";

/**
 * The problem statement.
 *
 * The only place in the application set in a reading face, and the only one
 * with a 68ch measure — narrower and the text falls apart, wider and the eye
 * loses the line. KaTeX genuinely earns its place here: complexities and
 * formulas are everyday content in algorithmic statements.
 *
 * Rendered on the server — the statement is public, so there is no reason to
 * ship a Markdown parser to the browser.
 */
export function Statement({ markdown }: { markdown: string }) {
  return (
    <div className="prose-statement">
      <Markdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
      >
        {markdown}
      </Markdown>
    </div>
  );
}

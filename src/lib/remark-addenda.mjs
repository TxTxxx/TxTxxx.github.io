// Only explicitly authored Blog callouts become addenda. Never infer them from file dates.
export default function remarkAddenda() {
  return (tree, file) => {
    if (!/[\\/]src[\\/]content[\\/]blog[\\/]/.test(file.path || "")) return;

    for (const node of tree.children) {
      if (node.type !== "blockquote") continue;
      const paragraph = node.children[0];
      const first = paragraph?.children?.[0];
      if (paragraph?.type !== "paragraph" || first?.type !== "text" || !/^\[!update\]/i.test(first.value)) continue;

      const firstLine = first.value.split("\n")[0];
      const date = firstLine.match(/^\[!update\][ \t]+(\d{4}-\d{2}-\d{2})[ \t]*$/i)?.[1];
      const parsed = date ? new Date(`${date}T00:00:00Z`) : null;
      if (!date || !parsed || Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== date) {
        file.fail("补记首行请写 [!update] YYYY-MM-DD，并使用真实有效的日期。", node);
      }

      // Remove just the marker line; retain the author's Markdown and its normal rendering.
      first.value = first.value.slice(firstLine.length).replace(/^\n/, "");
      if (!first.value) paragraph.children.shift();
      if (!paragraph.children.some(child => child.type !== "text" || child.value.trim())) node.children.shift();
      if (!node.children.length) file.fail("补记日期下方需要填写你自己的补充内容。", node);

      node.data = { hName: "aside", hProperties: { className: ["post-addendum"], ariaLabel: `补记，${date}` } };
      node.children.unshift({
        type: "paragraph",
        data: { hName: "header", hProperties: { className: ["addendum-header"] } },
        children: [
          { type: "strong", data: { hName: "span" }, children: [{ type: "text", value: "补记" }] },
          { type: "text", value: " " },
          { type: "emphasis", data: { hName: "time", hProperties: { dateTime: date } }, children: [{ type: "text", value: date }] }
        ]
      });
    }
  };
}

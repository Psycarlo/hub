import { Fragment } from "react";

import { MentionChip } from "@/components/mention-chip";
import { splitMentions } from "@/lib/mentions";

/**
 * Comment text with each mention shown as the person's name. Inside a link,
 * `plain` keeps the names from opening cards of their own.
 */
export function MentionText({
  content,
  plain = false,
}: {
  content: string;
  plain?: boolean;
}) {
  // Segments never reorder for the same content, so their index is a stable key.
  return splitMentions(content).map((segment, index) => (
    // oxlint-disable-next-line react/no-array-index-key
    <Fragment key={index}>
      {segment.type === "text" ? (
        segment.text
      ) : (
        <MentionChip plain={plain} userId={segment.userId} />
      )}
    </Fragment>
  ));
}

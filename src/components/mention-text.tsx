import { Fragment } from "react";

import { useUser } from "@/hooks/use-users";
import { splitMentions } from "@/lib/mentions";

function MentionChip({ userId }: { userId: string }) {
  const { name } = useUser(userId);
  return (
    <span className="bg-primary/15 rounded-md px-1 font-medium">@{name}</span>
  );
}

/** Comment text with each mention shown as the person's name. */
export function MentionText({ content }: { content: string }) {
  // Segments never reorder for the same content, so their index is a stable key.
  return splitMentions(content).map((segment, index) => (
    // oxlint-disable-next-line react/no-array-index-key
    <Fragment key={index}>
      {segment.type === "text" ? (
        segment.text
      ) : (
        <MentionChip userId={segment.userId} />
      )}
    </Fragment>
  ));
}

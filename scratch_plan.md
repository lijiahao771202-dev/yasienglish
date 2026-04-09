# Plan: Dynamic Multi-Column Layout for Definitions

- Update `VocabReviewEditableCard.tsx` back card layout.
- Instead of strict `max-w-[500px]`, make the card `max-w-[800px]` or `w-max` out to `800px`.
- Apply CSS multi-columns to the `meaningDraftGroups` container.
- Use `columns-1 md:columns-2 gap-6`.
- Add `break-inside-avoid` to the POS blocks so that individual POS blocks are kept together, OR allow meanings to flow to the next column.

Wait! If we let the user drag meanings, how does CSS columns affect drag?

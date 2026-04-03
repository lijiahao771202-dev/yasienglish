export function hasMeaningfulTextSelection(selection: Selection | null | undefined) {
    return Boolean(selection && !selection.isCollapsed && selection.toString().trim().length > 0);
}

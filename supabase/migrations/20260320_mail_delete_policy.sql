drop policy if exists "user_messages_owner_delete" on public.user_messages;
create policy "user_messages_owner_delete" on public.user_messages
for delete using (auth.uid() = user_id);


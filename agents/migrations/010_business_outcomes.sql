-- 010_business_outcomes.sql — Suite G: per-workspace business outcome view.
--
-- Notes / approximations:
--   * delivery_rate is a PROXY: (sent - bounced) / sent. We have no ESP
--     delivery webhooks, so a message counts as "delivered" unless a bounce
--     was recorded (status = 'bounced' or a suppression reason = 'bounce').
--   * pct_approved_unchanged is an APPROXIMATION: an approval counts as
--     "unchanged" when its payload carries no edit markers
--     (payload->'edits' / payload->'edited_subject' / payload->'edited_body').
--     The approvals flow stores reviewer edits under those keys; approvals
--     from older flows without edit tracking therefore count as unchanged.
--   * rates are null when the denominator is 0 (frontend renders "—").

create or replace view public.business_outcomes as
select
    w.id as workspace_id,
    coalesce(msg.sent_count, 0)                            as emails_sent,
    coalesce(msg.bounced_count, 0)                         as bounced_count,
    case when coalesce(msg.sent_count, 0) > 0
         then round((msg.sent_count - coalesce(msg.bounced_count, 0))::numeric
                    / msg.sent_count, 4) end               as delivery_rate,
    case when coalesce(msg.sent_count, 0) > 0
         then round(coalesce(msg.bounced_count, 0)::numeric
                    / msg.sent_count, 4) end               as bounce_rate,
    coalesce(rep.reply_count, 0)                           as reply_count,
    case when coalesce(msg.sent_count, 0) > 0
         then round(coalesce(rep.reply_count, 0)::numeric
                    / msg.sent_count, 4) end               as reply_rate,
    coalesce(rep.positive_count, 0)                        as positive_reply_count,
    case when coalesce(msg.sent_count, 0) > 0
         then round(coalesce(rep.positive_count, 0)::numeric
                    / msg.sent_count, 4) end               as positive_reply_rate,
    coalesce(mtg.meeting_count, 0)                         as meeting_booked_count,
    case when coalesce(msg.sent_count, 0) > 0
         then round(coalesce(rep.unsubscribe_count, 0)::numeric
                    / msg.sent_count, 4) end               as unsubscribe_rate,
    coalesce(appr.pending_count, 0)                        as approvals_pending,
    case when coalesce(appr.approved_count, 0) > 0
         then round(coalesce(appr.approved_unchanged_count, 0)::numeric
                    / appr.approved_count, 4) end          as pct_approved_unchanged
from public.workspaces w
left join lateral (
    select
        count(*) filter (where m.status in ('sent', 'bounced')) as sent_count,
        count(*) filter (where m.status = 'bounced')            as bounced_count
    from public.messages m
    where m.workspace_id = w.id and m.direction = 'outbound'
) msg on true
left join lateral (
    select
        count(*)                                                            as reply_count,
        count(*) filter (where r.intent in ('interested', 'meeting_requested')) as positive_count,
        count(*) filter (where r.intent = 'unsubscribe')                    as unsubscribe_count
    from public.replies r
    where r.workspace_id = w.id
) rep on true
left join lateral (
    select count(*) as meeting_count
    from public.meetings_v2 mv
    where mv.workspace_id = w.id
) mtg on true
left join lateral (
    select
        count(*) filter (where a.status = 'pending')  as pending_count,
        count(*) filter (where a.status = 'approved') as approved_count,
        count(*) filter (
            where a.status = 'approved'
              and not (a.payload ? 'edits')
              and not (a.payload ? 'edited_subject')
              and not (a.payload ? 'edited_body')
        ) as approved_unchanged_count
    from public.approvals a
    where a.workspace_id = w.id
) appr on true;

\set ON_ERROR_STOP on
begin;

create or replace function tclone(u uuid) returns uuid language sql immutable as $$
  select (substr(m,1,8)||'-'||substr(m,9,4)||'-5'||substr(m,14,3)||'-a'||substr(m,18,3)||'-'||substr(m,21,12))::uuid
  from (select md5(u::text || ':tutor-dmytro-clone-v1') m) s;
$$;

-- Scope --------------------------------------------------------------------
create temp table s_course on commit drop as select '82c35711-f042-5c27-9fe1-174bedee7911'::uuid id;
create temp table s_units on commit drop as
  select distinct ci.item_id id from container_items ci
  join container_versions cv on cv.id=ci.container_version_id
  where cv.container_id=(select id from s_course) and ci.item_type='container';
create temp table s_containers on commit drop as
  select id from s_course union select id from s_units;
create temp table s_cver on commit drop as
  select cv.id, cv.container_id from container_versions cv join s_containers c on c.id=cv.container_id;
create temp table s_items on commit drop as
  select ci.* from container_items ci join s_cver v on v.id=ci.container_version_id;
create temp table s_leaf on commit drop as
  select distinct item_type, item_id from s_items where item_type<>'container';

\set tutor '''9837beac-cb5d-42b8-9037-54e17f8b7c82'''

-- Containers ---------------------------------------------------------------
insert into containers (id,slug,container_type,target_language,difficulty_level,title,description,
  cover_image_media_id,owner_user_id,owner_school_id,visibility,access_tier,current_published_version_id,
  created_at,updated_at,deleted_at,level_system,archived_at,gating_mode,review_respond_within_hours)
select tclone(c.id),
       case when c.id=(select id from s_course) then 'ny-i-norge-a2-privat'
            when c.slug is null then null else c.slug||'-privat' end,
       c.container_type,c.target_language,c.difficulty_level,c.title,c.description,
       c.cover_image_media_id, :tutor::uuid, null,
       'public'::visibility, 'public_free'::access_tier,
       tclone(c.current_published_version_id),
       c.created_at, now(), null, c.level_system, null, c.gating_mode, c.review_respond_within_hours
from containers c join s_containers sc on sc.id=c.id;

update containers set title='Ny i Norge A2 — privattimer',
  description='Privatkurs i norsk (A2) hos Dmytro. Leksjon 17–19: helse, høytider og kontakt med nordmenn.'
where id=tclone((select id from s_course));

-- Versions, sections, items -------------------------------------------------
insert into container_versions (id,container_id,version_number,status,changelog,created_at,created_by_user_id,
  published_at,published_by_user_id,deprecated_at,sunset_at,archived_at,revision_count)
select tclone(cv.id),tclone(cv.container_id),cv.version_number,cv.status,cv.changelog,cv.created_at,:tutor::uuid,
  cv.published_at, case when cv.published_by_user_id is null then null else :tutor::uuid end,
  cv.deprecated_at,cv.sunset_at,cv.archived_at,cv.revision_count
from container_versions cv join s_cver s on s.id=cv.id;

insert into container_sections (id,container_version_id,title,position,created_at)
select tclone(cs.id),tclone(cs.container_version_id),cs.title,cs.position,cs.created_at
from container_sections cs join s_cver s on s.id=cs.container_version_id;

insert into container_items (id,container_version_id,position,item_type,item_id,is_required,section_label,added_at,section_id,xp_reward)
select tclone(ci.id),tclone(ci.container_version_id),ci.position,ci.item_type,tclone(ci.item_id),
  ci.is_required,ci.section_label,ci.added_at,tclone(ci.section_id),ci.xp_reward
from s_items ci;

insert into container_localizations (id,container_id,language_code,title,description,created_at,updated_at,created_by_user_id)
select tclone(cl.id),tclone(cl.container_id),cl.language_code,cl.title,cl.description,cl.created_at,cl.updated_at,:tutor::uuid
from container_localizations cl join s_containers sc on sc.id=cl.container_id;

-- Lessons ------------------------------------------------------------------
create temp table s_lesson on commit drop as select item_id id from s_leaf where item_type='lesson';
insert into lessons (id,target_language,difficulty_level,slug,title,description,cover_image_media_id,
  owner_user_id,owner_school_id,visibility,created_at,updated_at,deleted_at,kind,live_capacity,
  live_duration_minutes,live_join_url,live_starts_at)
select tclone(l.id),l.target_language,l.difficulty_level,
  case when l.slug is null then null else l.slug||'-privat' end,
  l.title,l.description,l.cover_image_media_id,:tutor::uuid,null,'public'::visibility,
  l.created_at,now(),null,l.kind,l.live_capacity,l.live_duration_minutes,l.live_join_url,l.live_starts_at
from lessons l join s_lesson s on s.id=l.id;

create temp table s_lcv on commit drop as
  select v.id from lesson_content_variants v join s_lesson s on s.id=v.lesson_id;

insert into lesson_content_variants (id,lesson_id,explanation_language,min_level,max_level,display_title,
  display_description,body_markdown,estimated_reading_minutes,status,created_at,updated_at,
  created_by_user_id,last_edited_by_user_id,published_at,deleted_at,transcript)
select tclone(v.id),tclone(v.lesson_id),v.explanation_language,v.min_level,v.max_level,v.display_title,
  v.display_description,v.body_markdown,v.estimated_reading_minutes,v.status,v.created_at,v.updated_at,
  :tutor::uuid,:tutor::uuid,v.published_at,null,v.transcript
from lesson_content_variants v join s_lcv s on s.id=v.id;

insert into lesson_paragraph_translations (id,lesson_content_variant_id,paragraph_index,translation,created_at,updated_at)
select tclone(t.id),tclone(t.lesson_content_variant_id),t.paragraph_index,t.translation,t.created_at,t.updated_at
from lesson_paragraph_translations t join s_lcv s on s.id=t.lesson_content_variant_id;

insert into lesson_text_spans (id,lesson_content_variant_id,paragraph_index,char_start,char_end,kind,ref_id,
  text_snapshot,note,created_at,updated_at,created_by_user_id)
select tclone(t.id),tclone(t.lesson_content_variant_id),t.paragraph_index,t.char_start,t.char_end,t.kind,
  tclone(t.ref_id),t.text_snapshot,t.note,t.created_at,t.updated_at,:tutor::uuid
from lesson_text_spans t join s_lcv s on s.id=t.lesson_content_variant_id;



insert into lesson_variant_media_refs (id,lesson_content_variant_id,media_id,media_type,position_in_text,extracted_at)
select tclone(t.id),tclone(t.lesson_content_variant_id),t.media_id,t.media_type,t.position_in_text,t.extracted_at
from lesson_variant_media_refs t join s_lcv s on s.id=t.lesson_content_variant_id;

insert into lesson_video_cues (id,lesson_content_variant_id,position,start_seconds,target_line,translation_line,created_at,updated_at)
select tclone(t.id),tclone(t.lesson_content_variant_id),t.position,t.start_seconds,t.target_line,t.translation_line,t.created_at,t.updated_at
from lesson_video_cues t join s_lcv s on s.id=t.lesson_content_variant_id;


-- Exercises ----------------------------------------------------------------
create temp table s_ex on commit drop as select item_id id from s_leaf where item_type='exercise';
insert into exercises (id,exercise_template_id,target_language,difficulty_level,content,expected_answers,
  answer_check_settings,owner_user_id,owner_school_id,visibility,estimated_duration_seconds,created_at,
  updated_at,deleted_at,draft_content,draft_expected_answers,draft_answer_check_settings,draft_updated_at,
  skills_override,focus_override,override_set_at)
select tclone(e.id),e.exercise_template_id,e.target_language,e.difficulty_level,e.content,e.expected_answers,
  e.answer_check_settings,:tutor::uuid,null,'public'::visibility,e.estimated_duration_seconds,e.created_at,
  now(),null,e.draft_content,e.draft_expected_answers,e.draft_answer_check_settings,e.draft_updated_at,
  e.skills_override,e.focus_override,e.override_set_at
from exercises e join s_ex s on s.id=e.id;

insert into exercise_instructions (id,exercise_id,instruction_language,instruction_text,hint_text,text_overrides,
  created_at,updated_at,draft_instruction_text,draft_hint_text,draft_text_overrides,draft_updated_at)
select tclone(i.id),tclone(i.exercise_id),i.instruction_language,i.instruction_text,i.hint_text,i.text_overrides,
  i.created_at,i.updated_at,i.draft_instruction_text,i.draft_hint_text,i.draft_text_overrides,i.draft_updated_at
from exercise_instructions i join s_ex s on s.id=i.exercise_id;

-- Vocabulary ---------------------------------------------------------------
create temp table s_vl on commit drop as select item_id id from s_leaf where item_type='vocabulary_list';
insert into vocabulary_lists (id,slug,title,description,target_language,difficulty_level,owner_user_id,
  owner_school_id,visibility,auto_add_to_srs,cover_image_media_id,created_at,updated_at,deleted_at)
select tclone(v.id), case when v.slug is null then null else v.slug||'-privat' end,
  v.title,v.description,v.target_language,v.difficulty_level,:tutor::uuid,null,'public'::visibility,
  v.auto_add_to_srs,v.cover_image_media_id,v.created_at,now(),null
from vocabulary_lists v join s_vl s on s.id=v.id;

create temp table s_vi on commit drop as
  select i.id from vocabulary_items i join s_vl s on s.id=i.vocabulary_list_id;
insert into vocabulary_items (id,vocabulary_list_id,word,position,part_of_speech,ipa_transcription,
  pronunciation_audio_media_id,grammatical_properties,register,notes,created_at,updated_at,deleted_at)
select tclone(i.id),tclone(i.vocabulary_list_id),i.word,i.position,i.part_of_speech,i.ipa_transcription,
  i.pronunciation_audio_media_id,i.grammatical_properties,i.register,i.notes,i.created_at,i.updated_at,i.deleted_at
from vocabulary_items i join s_vi s on s.id=i.id;

insert into vocabulary_item_translations (id,vocabulary_item_id,translation_language,primary_translation,
  alternative_translations,definition,usage_notes,false_friend_warning,created_at,updated_at,
  created_by_user_id,last_edited_by_user_id)
select tclone(t.id),tclone(t.vocabulary_item_id),t.translation_language,t.primary_translation,
  t.alternative_translations,t.definition,t.usage_notes,t.false_friend_warning,t.created_at,t.updated_at,
  :tutor::uuid,:tutor::uuid
from vocabulary_item_translations t join s_vi s on s.id=t.vocabulary_item_id;

create temp table s_vue on commit drop as
  select e.id from vocabulary_usage_examples e join s_vi s on s.id=e.vocabulary_item_id;
insert into vocabulary_usage_examples (id,vocabulary_item_id,example_text,position,audio_media_id,context_note,created_at,updated_at)
select tclone(e.id),tclone(e.vocabulary_item_id),e.example_text,e.position,e.audio_media_id,e.context_note,e.created_at,e.updated_at
from vocabulary_usage_examples e join s_vue s on s.id=e.id;

insert into vocabulary_example_translations (id,vocabulary_usage_example_id,translation_language,translated_text,created_at,updated_at)
select tclone(t.id),tclone(t.vocabulary_usage_example_id),t.translation_language,t.translated_text,t.created_at,t.updated_at
from vocabulary_example_translations t join s_vue s on s.id=t.vocabulary_usage_example_id;

-- Grammar rules ------------------------------------------------------------
create temp table s_gr on commit drop as select item_id id from s_leaf where item_type='grammar_rule';
insert into grammar_rules (id,slug,target_language,difficulty_level,topic,subtopic,title,description,
  owner_user_id,owner_school_id,visibility,created_at,updated_at,deleted_at)
select tclone(g.id), case when g.slug is null then null else g.slug||'-privat' end,
  g.target_language,g.difficulty_level,g.topic,g.subtopic,g.title,g.description,
  :tutor::uuid,null,'public'::visibility,g.created_at,now(),null
from grammar_rules g join s_gr s on s.id=g.id;

create temp table s_gre on commit drop as
  select e.id from grammar_rule_explanations e join s_gr s on s.id=e.grammar_rule_id;
insert into grammar_rule_explanations (id,grammar_rule_id,explanation_language,min_level,max_level,display_title,
  display_summary,body_markdown,estimated_reading_minutes,status,created_at,updated_at,created_by_user_id,
  last_edited_by_user_id,published_at,deleted_at,anchor_highlights,anchor_note,anchor_text)
select tclone(e.id),tclone(e.grammar_rule_id),e.explanation_language,e.min_level,e.max_level,e.display_title,
  e.display_summary,e.body_markdown,e.estimated_reading_minutes,e.status,e.created_at,e.updated_at,:tutor::uuid,
  :tutor::uuid,e.published_at,null,e.anchor_highlights,e.anchor_note,e.anchor_text
from grammar_rule_explanations e join s_gre s on s.id=e.id;

insert into grammar_rule_compare_examples (id,explanation_id,position,sentence,note,is_correct,created_at,updated_at)
select tclone(c.id),tclone(c.explanation_id),c.position,c.sentence,c.note,c.is_correct,c.created_at,c.updated_at
from grammar_rule_compare_examples c join s_gre s on s.id=c.explanation_id;

insert into grammar_rule_quick_checks (id,explanation_id,question,options,correct_option_index,explanation,created_at,updated_at)
select tclone(q.id),tclone(q.explanation_id),q.question,q.options,q.correct_option_index,q.explanation,q.created_at,q.updated_at
from grammar_rule_quick_checks q join s_gre s on s.id=q.explanation_id;

insert into grammar_rule_exercise_pool (id,grammar_rule_id,exercise_id,position,weight,added_at,added_by_user_id)
select tclone(p.id),tclone(p.grammar_rule_id),tclone(p.exercise_id),p.position,p.weight,p.added_at,:tutor::uuid
from grammar_rule_exercise_pool p join s_gr s on s.id=p.grammar_rule_id;

-- Deferred: these reference exercises / vocabulary items created above.
insert into lesson_listening_stages (id,lesson_content_variant_id,exercise_id,position,stage_type,created_at)
select tclone(t.id),tclone(t.lesson_content_variant_id),tclone(t.exercise_id),t.position,t.stage_type,t.created_at
from lesson_listening_stages t join s_lcv s on s.id=t.lesson_content_variant_id;

insert into lesson_variant_glossary_marks (id,lesson_content_variant_id,vocabulary_item_id,occurrence_count,created_at,updated_at)
select tclone(t.id),tclone(t.lesson_content_variant_id),tclone(t.vocabulary_item_id),t.occurrence_count,t.created_at,t.updated_at
from lesson_variant_glossary_marks t join s_lcv s on s.id=t.lesson_content_variant_id;

insert into lesson_video_questions (id,lesson_content_variant_id,exercise_id,created_at,updated_at)
select tclone(t.id),tclone(t.lesson_content_variant_id),tclone(t.exercise_id),t.created_at,t.updated_at
from lesson_video_questions t join s_lcv s on s.id=t.lesson_content_variant_id;

commit;

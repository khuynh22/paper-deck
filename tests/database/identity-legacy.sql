insert into auth.users(id) values ('20000000-0000-0000-0000-000000000001'), ('20000000-0000-0000-0000-000000000002');
insert into papers(id,arxiv_id,doi,title,authors,published_at,citations,hf_upvotes,fetched_at) values
('10000000-0000-0000-0000-000000000001','legacy-identity',' 10.TEST/Legacy ','Canonical',array['A'],'2024-06-15T12:00:00Z',2,1,'2020-01-01'),
('10000000-0000-0000-0000-000000000002',null,'10.test/legacy','Partial duplicate',array['A','B'],'2024-01-01',50,5,'2021-01-01');
update papers set abstract='Full abstract',venue='Conference' where id='10000000-0000-0000-0000-000000000002';
insert into paper_content(paper_id,kind,sanitized_html) select id,'html','<p data-blk="0">Hello world.</p>' from papers where doi ilike '%legacy%';
insert into stars(user_id,paper_id,created_at) values
('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','2020-01-01'),
('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002','2021-01-01'),
('20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002','2021-01-01');
insert into reading_progress(user_id,paper_id,scroll_pct,read_pct,marked_pct,block_anchor,marked_anchor,reader_kind,status,updated_at) values
('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',0.4,0.5,0.3,'0','0','html','reading','2020-01-01'),
('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002',0.4,0.5,0.3,'0','0','html','reading','2021-01-01');
insert into highlights(id,user_id,paper_id,block_anchor,start_offset,end_offset,quote,note) values
('30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002','0',0,5,'Hello','Keep this note'),
('30000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','0',6,11,'world','Keep another note');

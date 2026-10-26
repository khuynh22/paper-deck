do $$
declare kind text; a uuid; b uuid;
begin
  foreach kind in array array['arxiv','progress','cache','missing-cache','pdf','overlap','unknown-reader'] loop
    insert into papers(doi,title,pdf_url) values('10.test/unsafe-'||kind,'Unsafe A','https://example.test/a.pdf') returning id into a;
    insert into papers(doi,title,pdf_url) values('10.test/unsafe-'||kind,'Unsafe B','https://example.test/a.pdf') returning id into b;
    if kind='arxiv' then
      update papers set arxiv_id='unsafe-a' where id=a;
      update papers set arxiv_id='unsafe-b' where id=b;
    else
      insert into paper_content(paper_id,kind,sanitized_html) values(a,'html','<p data-blk="0">Same text.</p>'),(b,'html','<p data-blk="0">Same text.</p>');
      insert into reading_progress(user_id,paper_id,scroll_pct,reader_kind) values('20000000-0000-0000-0000-000000000001',a,0.4,'html');
      if kind='progress' then
        insert into reading_progress(user_id,paper_id,scroll_pct,reader_kind) values('20000000-0000-0000-0000-000000000001',b,0.8,'html');
      elsif kind='cache' then
        update paper_content set sanitized_html='<p data-blk="0">Different text.</p>' where paper_id=b;
      elsif kind='missing-cache' then
        delete from paper_content where paper_id=a;
      elsif kind='pdf' then
        update reading_progress set reader_kind='pdf' where paper_id=a;
        update paper_content set kind='pdf-meta',sanitized_html=null,page_count=2 where paper_id in(a,b);
        update papers set pdf_url='https://example.test/b.pdf',arxiv_id='unsafe-pdf-to-html' where id=b;
      elsif kind='unknown-reader' then
        update reading_progress set reader_kind=null where paper_id=a;
        update paper_content set kind='pdf-meta',sanitized_html=null,page_count=2 where paper_id in(a,b);
        update papers set pdf_url='https://example.test/b.pdf' where id=b;
      elsif kind='overlap' then
        insert into highlights(user_id,paper_id,block_anchor,start_offset,end_offset,quote,note) values
        ('20000000-0000-0000-0000-000000000001',a,'0',0,4,'Same','One'),
        ('20000000-0000-0000-0000-000000000001',b,'0',0,4,'Same','Two');
      end if;
    end if;
  end loop;
end $$;

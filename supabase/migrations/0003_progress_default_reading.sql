-- reading_progress: default new rows to 'reading', not 'to_read'.
--
-- A row only ever exists once a user has opened a paper, and saveProgress now
-- writes `status` only when it changes (so a debounced scroll save can't
-- downgrade a finished 'done' paper back to 'reading'). That means the FIRST
-- save on open omits status and relies on this column default — which must be
-- 'reading' so the paper lands on the "Continue reading" shelf.
alter table reading_progress alter column status set default 'reading';

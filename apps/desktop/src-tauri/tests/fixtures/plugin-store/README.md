These three files were written by tauri-plugin-store 2.4.4, which TaskMint
used for its data files before P5 replaced it with `src/store/json_file.rs`.
They pin the format both ways: `JsonFileStore` must read them, and the plugin
must read what `JsonFileStore` writes (so an older TaskMint still opens the
data). Don't edit or regenerate them by hand.

They also carry the records older builds left: a session from before most
fields existed, a paused timer stranded in an inactive session, records with
no id, a work-log entry of an unknown kind, a task with no dates, and the
`initialized` key an early build wrote to appdata.json.

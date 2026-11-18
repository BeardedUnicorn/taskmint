---
bump: patch
type: Fixed
---
A note template field's pattern has to be a valid regular expression: the
field says so, and the template can't be saved until it's fixed or cleared. A
broken pattern saved earlier no longer stops notes on that template from
saving.

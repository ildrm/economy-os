# `@economyos/model-governance`

Phase 13 domain core for model governance and research operations. The package provides
content-addressed inventory, model-card, artifact, data, label, experiment, validation, research,
deployment, monitoring, forecast, and retirement records plus an append-only lifecycle ledger.

The ledger is deliberately fail-closed. Production and calibrated/causal language require exact
evidence and separated approvals; demo or synthetic results cannot be presented as empirical;
forecasts can only gain separate outcome records; and every event is protected by a deterministic
hash chain that can be replayed and checked.

This package is an in-process domain implementation. Persistence, authorization at a transport
boundary, a notebook execution sandbox, signing-key custody, background monitoring, user
interfaces, and empirical validation of any actual EconomyOS model remain integration work.

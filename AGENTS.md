Prefix shell commands with `rtk`; use `rtk proxy` for commands without a dedicated wrapper.

For data-source selection, ingestion, price semantics, economic observations,
currency conversion, exports and public presentation, follow
[the user's data source policy](docs/data-source-policy.md).

Use the shared source-policy and observation contracts. Do not infer permissions
from Grade A/B labels, substitute third-party observations for available official
variables, convert indices into money, or present catalog-only sources as connected.
All new price adapters must enforce this policy before extraction and persist the
complete observation metadata before publication. Legacy database ingestion is not
certified by the public snapshot verifier; do not claim otherwise.

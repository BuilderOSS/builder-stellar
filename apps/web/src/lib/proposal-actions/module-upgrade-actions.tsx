import { Field, FieldLabel, Input, Select } from '@/components/ui';
import { hashFromHex, moduleAddressKeys, type UpgradeModule } from '@/lib/admin-module-versions';
import type { PendingAdminHandler } from '@/lib/proposal-actions/artwork-admin-actions';

export type ModuleUpgradeDraft = { module: UpgradeModule; fromHash: string; toHash: string };
export const moduleUpgradeHandler: PendingAdminHandler<ModuleUpgradeDraft, 'upgrade-dao-module'> = {
  type: 'upgrade-dao-module',
  label: 'Upgrade a module',
  group: 'System',
  description: 'Upgrade a current module along a Manager-approved transition. Approval is checked again on-chain.',
  FormComponent: ({ value, onChange, disabled }) => (
    <>
      <Field>
        <FieldLabel htmlFor="upgrade-module">Module</FieldLabel>
        <Select
          id="upgrade-module"
          value={value.module}
          disabled={disabled}
          onChange={(event) => {
            const selectedModule = event.target.value;
            if (selectedModule in moduleAddressKeys) onChange({ ...value, module: selectedModule as UpgradeModule });
          }}
        >
          {Object.keys(moduleAddressKeys).map((module) => (
            <option key={module}>{module}</option>
          ))}
        </Select>
      </Field>
      <Field>
        <FieldLabel htmlFor="upgrade-from-hash">Current WASM hash</FieldLabel>
        <Input
          id="upgrade-from-hash"
          disabled={disabled}
          value={value.fromHash}
          onChange={(event) => onChange({ ...value, fromHash: event.target.value })}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="upgrade-to-hash">Approved target WASM hash</FieldLabel>
        <Input
          id="upgrade-to-hash"
          disabled={disabled}
          value={value.toHash}
          onChange={(event) => onChange({ ...value, toHash: event.target.value })}
        />
      </Field>
    </>
  ),
  getDefaultValues: () => ({ module: 'token', fromHash: '', toHash: '' }),
  validate: (data, context) => {
    if (!(data.module in moduleAddressKeys) || !context.config[moduleAddressKeys[data.module]])
      return { valid: false, message: 'Choose a configured DAO module.' };
    try {
      hashFromHex(data.fromHash);
      hashFromHex(data.toHash);
    } catch (error) {
      return { valid: false, message: (error as Error).message };
    }
    if (data.fromHash.toLowerCase() === data.toHash.toLowerCase())
      return { valid: false, message: 'Target hash is unchanged.' };
    return { valid: true };
  },
  serialize: (data) => ({ id: crypto.randomUUID(), type: 'upgrade-dao-module', recipient: '', amount: '', ...data }),
  deserialize: (action) => ({ module: action.module, fromHash: action.fromHash, toHash: action.toHash }),
  buildCallVector: (data, context) => ({
    target: context.config[moduleAddressKeys[data.module]],
    function: 'upgrade',
    args: [data.fromHash, data.toHash]
  })
};

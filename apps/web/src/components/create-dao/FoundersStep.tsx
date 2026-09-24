// components/create-dao/FoundersStep.tsx

'use client';

import { Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Stack } from 'styled-system/jsx';

import { FounderCsvUpload } from '@/components/create-dao/FounderCsvUpload';
import { Badge, Button, Card, Heading, Input, Text } from '@/components/ui';
import { MAX_FOUNDER_ALLOCATION, MAX_FOUNDERS } from '@/lib/founders-csv';
import { getStellarAddressError, hasDuplicates, isValidStellarAddress } from '@/lib/validation';
import { selectTotalFounderAllocation, useCreateDaoStore } from '@/stores/create-dao-store';

export function FoundersStep() {
  const founders = useCreateDaoStore((s) => s.founders);
  const addFounder = useCreateDaoStore((s) => s.addFounder);
  const replaceFounders = useCreateDaoStore((s) => s.replaceFounders);
  const removeFounder = useCreateDaoStore((s) => s.removeFounder);
  const updateFounder = useCreateDaoStore((s) => s.updateFounder);
  const totalAllocation = useCreateDaoStore(selectTotalFounderAllocation);
  const validationErrors = useCreateDaoStore((s) => s.validationErrors);
  const setValidationError = useCreateDaoStore((s) => s.setValidationError);
  const clearValidationError = useCreateDaoStore((s) => s.clearValidationError);

  const [newFounderAddress, setNewFounderAddress] = useState('');
  const [newFounderAmount, setNewFounderAmount] = useState('');
  const [addressError, setAddressError] = useState('');
  const [amountError, setAmountError] = useState('');

  const validateFounders = () => {
    const currentFounders = useCreateDaoStore.getState().founders;
    const totalAllocation = currentFounders.reduce((sum, f) => sum + f.amount, 0);
    if (totalAllocation > MAX_FOUNDER_ALLOCATION) {
      setValidationError(
        'founders',
        `Total founder allocation (${totalAllocation}) exceeds maximum of ${MAX_FOUNDER_ALLOCATION.toLocaleString()} tokens`
      );
      return;
    }

    // Validate each founder
    let hasErrors = false;
    currentFounders.forEach((founder, index) => {
      if (!isValidStellarAddress(founder.address)) {
        const error = getStellarAddressError(founder.address);
        setValidationError(`founder${index}Address`, `Founder ${index + 1}: ${error || 'Invalid address'}`);
        hasErrors = true;
      } else {
        clearValidationError(`founder${index}Address`);
      }

      if (founder.amount <= 0) {
        setValidationError(`founder${index}Amount`, `Founder ${index + 1}: Amount must be greater than 0`);
        hasErrors = true;
      } else if (!Number.isInteger(founder.amount)) {
        setValidationError(`founder${index}Amount`, `Founder ${index + 1}: Amount must be a whole number`);
        hasErrors = true;
      } else if (founder.amount > MAX_FOUNDER_ALLOCATION) {
        setValidationError(
          `founder${index}Amount`,
          `Founder ${index + 1}: Amount cannot exceed ${MAX_FOUNDER_ALLOCATION.toLocaleString()} tokens`
        );
        hasErrors = true;
      } else {
        clearValidationError(`founder${index}Amount`);
      }
    });

    // Check for duplicate addresses
    if (hasDuplicates(currentFounders, (f) => f.address.toLowerCase())) {
      setValidationError('founders', 'Duplicate founder addresses are not allowed');
      hasErrors = true;
    } else if (!hasErrors && totalAllocation <= MAX_FOUNDER_ALLOCATION) {
      clearValidationError('founders');
    }
  };

  const handleAddFounder = () => {
    const address = newFounderAddress.trim();
    if (!address || !newFounderAmount) return;

    // Validate address
    if (!isValidStellarAddress(address)) {
      setAddressError(getStellarAddressError(address) || 'Invalid address');
      return;
    }

    // Check for duplicate
    if (founders.some((f) => f.address.toLowerCase() === address.toLowerCase())) {
      setAddressError('This founder address has already been added');
      return;
    }

    const amount = Number(newFounderAmount);
    if (!Number.isSafeInteger(amount) || amount <= 0) {
      setAmountError('Amount must be a positive whole number');
      return;
    }
    if (amount > MAX_FOUNDER_ALLOCATION) {
      setAmountError(`Amount cannot exceed ${MAX_FOUNDER_ALLOCATION.toLocaleString()} tokens`);
      return;
    }
    if (totalAllocation + amount > MAX_FOUNDER_ALLOCATION) {
      setAmountError(`Total allocation cannot exceed ${MAX_FOUNDER_ALLOCATION.toLocaleString()} tokens`);
      return;
    }

    addFounder({ address, amount });
    setNewFounderAddress('');
    setNewFounderAmount('');
    setAddressError('');
    setAmountError('');
    setTimeout(validateFounders, 0);
  };

  const handleUpdateAmount = (index: number, value: string) => {
    const amount = Number(value);
    if (Number.isSafeInteger(amount) && amount > 0 && amount <= MAX_FOUNDER_ALLOCATION) {
      updateFounder(index, { ...founders[index], amount });
      setTimeout(validateFounders, 0);
    }
  };

  const handleRemoveFounder = (index: number) => {
    removeFounder(index);
    setTimeout(validateFounders, 0);
  };

  const allocationValid = totalAllocation <= MAX_FOUNDER_ALLOCATION;

  return (
    <Stack gap="4">
      <Card p="5">
        <Stack gap="4">
          <div>
            <Heading as="h2" style={{ fontSize: '1.25rem', marginBottom: '8px' }}>
              Who gets the first tokens?
            </Heading>
            <Text style={{ color: 'var(--gray-11)', fontSize: '0.875rem' }}>
              Set the initial founder allocations for your DAO. You can add more members later through governance
              proposals.
            </Text>
          </div>

          <div
            style={{
              padding: '1rem',
              background: allocationValid ? 'var(--success-2)' : 'var(--error-2)',
              border: `1px solid ${allocationValid ? 'var(--success-6)' : 'var(--error-6)'}`,
              borderRadius: '8px'
            }}
          >
            <Text
              style={{
                fontWeight: 600,
                fontSize: '1.125rem',
                color: allocationValid ? 'var(--success-11)' : 'var(--error-11)'
              }}
            >
              Initial allocation: {totalAllocation} tokens
            </Text>
            <Text
              style={{
                fontSize: '0.875rem',
                color: allocationValid ? 'var(--success-11)' : 'var(--error-11)',
                marginTop: '4px'
              }}
            >
              {allocationValid
                ? `${MAX_FOUNDER_ALLOCATION - totalAllocation} tokens remaining`
                : `Exceeds maximum of ${MAX_FOUNDER_ALLOCATION.toLocaleString()} tokens`}
            </Text>
          </div>

          {validationErrors.founders && (
            <Text style={{ color: 'var(--error-9)', fontSize: '0.875rem' }}>{validationErrors.founders}</Text>
          )}
        </Stack>
      </Card>

      <Card p="5">
        <FounderCsvUpload
          onParsed={(importedFounders) => {
            replaceFounders(importedFounders);
            Object.keys(validationErrors)
              .filter((key) => key === 'founders' || key.startsWith('founder'))
              .forEach((key) => clearValidationError(key));
          }}
        />
      </Card>

      <Card p="5">
        <Stack gap="4">
          <Heading as="h3" style={{ fontSize: '1.125rem' }}>
            Add one founder
          </Heading>

          <Stack gap="2">
            <label htmlFor="founderAddress">
              <Text style={{ fontWeight: 600 }}>Stellar Address</Text>
            </label>
            <Input
              id="founderAddress"
              value={newFounderAddress}
              onChange={(e) => {
                setNewFounderAddress(e.target.value);
                setAddressError('');
              }}
              placeholder="G..."
            />
            {addressError && <Text style={{ color: 'var(--error-9)', fontSize: '0.875rem' }}>{addressError}</Text>}
            <Text style={{ color: 'var(--gray-11)', fontSize: '0.875rem' }}>
              Stellar public key of the founder (starts with G)
            </Text>
          </Stack>

          <Stack gap="2">
            <label htmlFor="founderAmount">
              <Text style={{ fontWeight: 600 }}>Token Amount</Text>
            </label>
            <Input
              id="founderAmount"
              type="number"
              value={newFounderAmount}
              onChange={(e) => {
                setNewFounderAmount(e.target.value);
                setAmountError('');
              }}
              placeholder="10"
              min="1"
              max={MAX_FOUNDER_ALLOCATION}
              step="1"
            />
            {amountError && <Text style={{ color: 'var(--error-9)', fontSize: '0.875rem' }}>{amountError}</Text>}
            <Text style={{ color: 'var(--gray-11)', fontSize: '0.875rem' }}>
              Initial token allocation for this founder
            </Text>
          </Stack>

          <Button
            onClick={handleAddFounder}
            disabled={!newFounderAddress || !newFounderAmount || !allocationValid || founders.length >= MAX_FOUNDERS}
          >
            Add founder
          </Button>
          {founders.length >= MAX_FOUNDERS && (
            <Text style={{ color: 'var(--gray-11)', fontSize: '0.8rem' }}>
              You can add up to {MAX_FOUNDERS} founders during setup.
            </Text>
          )}
        </Stack>
      </Card>

      {founders.length > 0 && (
        <Card p="5">
          <Stack gap="4">
            <Heading as="h3" style={{ fontSize: '1.125rem' }}>
              Founders ({founders.length})
            </Heading>

            <Stack gap="3">
              {founders.map((founder, index) => (
                <Card key={index} p="4" style={{ background: 'var(--gray-2)', border: '1px solid var(--gray-6)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <Text
                        style={{
                          fontSize: '0.875rem',
                          fontFamily: 'monospace',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis'
                        }}
                      >
                        {founder.address}
                      </Text>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ display: 'grid', gap: '4px' }}>
                        <Input
                          type="number"
                          value={founder.amount}
                          onChange={(e) => handleUpdateAmount(index, e.target.value)}
                          min="1"
                          max={MAX_FOUNDER_ALLOCATION}
                          step="1"
                          style={{ width: '80px' }}
                        />
                        {validationErrors[`founder${index}Amount`] && (
                          <Text style={{ color: 'var(--error-9)', fontSize: '0.75rem' }}>
                            {validationErrors[`founder${index}Amount`]}
                          </Text>
                        )}
                      </div>
                      <Badge>{founder.amount} NFTs</Badge>
                      <Button
                        variant="outline"
                        onClick={() => handleRemoveFounder(index)}
                        style={{
                          padding: '8px 12px',
                          color: 'var(--error-9)'
                        }}
                      >
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </Stack>
          </Stack>
        </Card>
      )}
    </Stack>
  );
}

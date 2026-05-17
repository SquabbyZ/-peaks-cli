import { Command } from 'commander';
import { resolveCapabilityAvailability } from '../../services/recommendations/capability-availability.js';
import { seedCapabilityItems, seedCapabilitySources } from '../../services/recommendations/seed-capability-catalog.js';
import { ok } from '../../shared/result.js';
import { addJsonOption, printResult, type ProgramIO } from '../cli-helpers.js';

export function registerCapabilityCommands(program: Command, io: ProgramIO): void {
  const capability = program.command('capability').description('Inspect Peaks capability catalog and runtime availability');
  addJsonOption(capability.command('status').description('Show seed capability availability')).action((options: { json?: boolean }) => {
    const availability = resolveCapabilityAvailability(seedCapabilityItems);
    printResult(io, ok('capability.status', { sources: seedCapabilitySources, items: seedCapabilityItems, availability }), options.json);
  });
}

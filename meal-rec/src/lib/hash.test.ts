// ABOUTME: Unit tests for PIN hashing and verification utilities using bcrypt
// ABOUTME: Tests password strength, hash generation, and verification accuracy

import { describe, it, expect } from 'vitest';
import bcrypt from 'bcryptjs';

describe('PIN Hashing', () => {
  describe('Hash Generation', () => {
    it('should generate different hashes for the same PIN', async () => {
      const pin = '1234';
      
      const hash1 = await bcrypt.hash(pin, 10);
      const hash2 = await bcrypt.hash(pin, 10);
      
      expect(hash1).not.toBe(hash2);
      expect(hash1).toMatch(/^\$2[aby]\$10\$/);
      expect(hash2).toMatch(/^\$2[aby]\$10\$/);
    });

    it('should generate hashes with different salt rounds', async () => {
      const pin = '1234';
      
      const hash8 = await bcrypt.hash(pin, 8);
      const hash12 = await bcrypt.hash(pin, 12);
      
      expect(hash8).toMatch(/^\$2[aby]\$08\$/);
      expect(hash12).toMatch(/^\$2[aby]\$12\$/);
    });

    it('should handle different PIN formats', async () => {
      const pins = ['0000', '1234', '9999', '0123'];
      
      for (const pin of pins) {
        const hash = await bcrypt.hash(pin, 10);
        expect(hash).toMatch(/^\$2[aby]\$10\$/);
        expect(hash.length).toBeGreaterThan(50);
      }
    });
  });

  describe('Hash Verification', () => {
    it('should verify correct PIN against hash', async () => {
      const pin = '1234';
      const hash = await bcrypt.hash(pin, 10);
      
      const isValid = await bcrypt.compare(pin, hash);
      
      expect(isValid).toBe(true);
    });

    it('should reject incorrect PIN against hash', async () => {
      const correctPin = '1234';
      const incorrectPin = '5678';
      const hash = await bcrypt.hash(correctPin, 10);
      
      const isValid = await bcrypt.compare(incorrectPin, hash);
      
      expect(isValid).toBe(false);
    });

    it('should handle edge cases in PIN comparison', async () => {
      const testCases = [
        { correct: '0000', incorrect: '0001' },
        { correct: '1234', incorrect: '1235' },
        { correct: '9999', incorrect: '9998' },
        { correct: '0123', incorrect: '0124' }
      ];

      for (const { correct, incorrect } of testCases) {
        const hash = await bcrypt.hash(correct, 10);
        
        expect(await bcrypt.compare(correct, hash)).toBe(true);
        expect(await bcrypt.compare(incorrect, hash)).toBe(false);
      }
    });

    it('should reject completely different input types', async () => {
      const pin = '1234';
      const hash = await bcrypt.hash(pin, 10);
      
      // Test various invalid inputs
      const invalidInputs = ['', '123', '12345', 'abcd', 'null', 'undefined'];
      
      for (const invalid of invalidInputs) {
        const isValid = await bcrypt.compare(invalid, hash);
        expect(isValid).toBe(false);
      }
    });
  });

  describe('Security Properties', () => {
    it('should produce non-reversible hashes', async () => {
      const pin = '1234';
      const hash = await bcrypt.hash(pin, 10);
      
      // Hash should not contain the original PIN
      expect(hash).not.toContain(pin);
      expect(hash).not.toContain('1234');
    });

    it('should take reasonable time to hash (performance check)', async () => {
      const pin = '1234';
      const startTime = Date.now();
      
      await bcrypt.hash(pin, 10);
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      // Should take some time (security) but not too long (usability)
      expect(duration).toBeGreaterThan(10); // At least 10ms
      expect(duration).toBeLessThan(2000); // Less than 2 seconds
    });

    it('should handle concurrent hashing operations', async () => {
      const pins = ['1111', '2222', '3333', '4444', '5555'];
      
      const hashPromises = pins.map(pin => bcrypt.hash(pin, 10));
      const hashes = await Promise.all(hashPromises);
      
      // All should be different
      const uniqueHashes = new Set(hashes);
      expect(uniqueHashes.size).toBe(pins.length);
      
      // All should verify correctly
      for (let i = 0; i < pins.length; i++) {
        const isValid = await bcrypt.compare(pins[i], hashes[i]);
        expect(isValid).toBe(true);
      }
    });
  });

  describe('Hash Format Validation', () => {
    it('should generate properly formatted bcrypt hashes', async () => {
      const pin = '1234';
      const hash = await bcrypt.hash(pin, 10);
      
      // bcrypt hash format: $2a$rounds$salt+hash (60 chars total)
      expect(hash).toMatch(/^\$2[aby]\$\d{2}\$.{53}$/);
      expect(hash.length).toBe(60);
    });

    it('should handle various salt round configurations', async () => {
      const pin = '1234';
      const rounds = [8, 10, 12];
      
      for (const round of rounds) {
        const hash = await bcrypt.hash(pin, round);
        const roundStr = round.toString().padStart(2, '0');
        expect(hash).toContain(`$${roundStr}$`);
      }
    });
  });
});
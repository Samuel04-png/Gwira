import {describe,it,expect} from 'vitest';
import {passwordStrength} from '../src/renderer/auth/passwordStrength.js';
describe('local password guidance',()=>{
 it('keeps empty values neutral',()=>expect(passwordStrength('').score).toBe(0));
 it('does not consider common predictable passwords strong regardless of length',()=>{for(const value of ['Password123456789012345','aaaaaaaaaaaaaaaaaaaaaaaa'])expect(passwordStrength(value).score).toBe(1);});
 it('uses length without requiring symbols',()=>{expect(passwordStrength('orchid river').score).toBe(2);expect(passwordStrength('orchid river cedar').score).toBe(3);expect(passwordStrength('orchid river cedar lantern').score).toBe(4);});
});

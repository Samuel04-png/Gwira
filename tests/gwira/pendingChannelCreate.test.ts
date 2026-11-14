import {describe, expect, it} from 'vitest';
import {parsePendingChannelCreate} from '../../src/renderer/gwira/dashboard/pendingChannelCreate.js';

describe('pending channel creation', () => {
  const pending = {type:'create',id:'8b8b58c9-1348-41dd-91f7-c1696896e891',name:'Team',topic:'',visibility:'private',members:['c1c6d108-5466-4d12-8d0d-f718db377837']};
  it('restores a request with its stable id and members', () => {
    expect(parsePendingChannelCreate(JSON.stringify(pending))).toEqual(pending);
    expect(parsePendingChannelCreate(null)).toBeNull();
    expect(parsePendingChannelCreate('null')).toBeNull();
  });
  it('rejects invalid stored requests instead of creating a different channel', () => {
    for (const value of [{...pending,id:'bad'}, {...pending,name:''}, {...pending,members:['bad']}, {...pending,visibility:'public'}, {}, []]) {
      expect(()=>parsePendingChannelCreate(JSON.stringify(value))).toThrow();
    }
  });
});

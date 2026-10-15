describe('Permission Checks', () => {
  function canAccessGroupWallet(userId, groupMembers) {
    return groupMembers.some((m) => m.userId === userId);
  }

  function canApproveWithdrawal(userId, groupMembers) {
    return groupMembers.some((m) => m.userId === userId && m.isLeader);
  }

  function canApproveOtherGroupWithdrawal(userId, groupAMembers, groupBMembers) {
    const isLeaderOfA = groupAMembers.some((m) => m.userId === userId && m.isLeader);
    const isMemberOfB = groupBMembers.some((m) => m.userId === userId);
    return isLeaderOfA && isMemberOfB;
  }

  const groupMembers = [
    { userId: 'leader-1', isLeader: true },
    { userId: 'member-1', isLeader: false },
    { userId: 'member-2', isLeader: false },
  ];

  it('member can access group wallet', () => {
    expect(canAccessGroupWallet('member-1', groupMembers)).toBe(true);
  });

  it('non-member cannot access group wallet', () => {
    expect(canAccessGroupWallet('outsider-1', groupMembers)).toBe(false);
  });

  it('leader can approve withdrawal', () => {
    expect(canApproveWithdrawal('leader-1', groupMembers)).toBe(true);
  });

  it('regular member cannot approve withdrawal', () => {
    expect(canApproveWithdrawal('member-1', groupMembers)).toBe(false);
  });

  it('non-member cannot approve withdrawal', () => {
    expect(canApproveWithdrawal('outsider-1', groupMembers)).toBe(false);
  });

  it('group A leader cannot approve group B withdrawals (different group isolation)', () => {
    const groupAMembers = [{ userId: 'leader-a', isLeader: true }];
    const groupBMembers = [{ userId: 'leader-b', isLeader: true }, { userId: 'member-b', isLeader: false }];
    expect(canApproveWithdrawal('leader-a', groupBMembers)).toBe(false);
  });
});

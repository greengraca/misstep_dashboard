import { withAuthRead } from "@/lib/api-helpers";
import { getLatestBalance } from "@/lib/cardmarket";
import { getAllTimeTreasury } from "@/lib/finance";

export const GET = withAuthRead(async () => {
  const [balanceSnapshot, treasury] = await Promise.all([
    getLatestBalance(),
    getAllTimeTreasury(),
  ]);

  const cmBalance = balanceSnapshot?.balance ?? 0;
  const current = Math.round((cmBalance + treasury) * 100) / 100;

  return {
    data: {
      name: "Capital Social",
      description: "Start a proper company",
      target: 5000,
      current,
      breakdown: {
        cmBalance: Math.round(cmBalance * 100) / 100,
        treasury,
      },
    },
  };
}, "home-goal");

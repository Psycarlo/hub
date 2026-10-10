import type { FormEvent } from "react";
import { useId, useState } from "react";
import { useLocation } from "wouter";

import { HexSwatchPicker } from "@/components/color-picker";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Figures } from "@/features/finance/account-card";
import { SwitchRow } from "@/features/finance/entry-fields";
import { accountPath, financePath } from "@/features/finance/finance-context";
import {
  CARD_COLORS,
  DEFAULT_LOOK,
  NETWORK_NAMES,
  WALLET_COLORS,
  WalletCard,
} from "@/features/finance/wallet-card";
import { useMe } from "@/hooks/use-users";
import type {
  Account,
  AccountLook,
  CardNetwork,
  MonthTotals,
} from "@/lib/finance";
import { CARD_NETWORKS, MAX_ACCOUNT_TITLE } from "@/lib/finance";
import {
  createAccount,
  deleteAccount,
  updateAccount,
} from "@/lib/finance-actions";
import type { Fiat } from "@/lib/portfolio";
import { FIATS } from "@/lib/portfolio";
import type { Project } from "@/lib/project";

function DeleteAccount({
  project,
  account,
  onDeleted,
}: {
  project: Project;
  account: Account;
  onDeleted: () => void;
}) {
  const [, navigate] = useLocation();
  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={
          <Button className="sm:mr-auto" type="button" variant="destructive" />
        }
      >
        Delete account
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {account.title}?</AlertDialogTitle>
          <AlertDialogDescription>
            Its months, entries and monthly entries disappear for everyone.
            Bitcoin buys its debits paid for stay in their portfolios.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              deleteAccount(account);
              onDeleted();
              navigate(financePath(project), { replace: true });
            }}
            variant="destructive"
          >
            Delete account
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Nothing in or out yet, for the wallet's preview. */
const NO_TOTALS: MonthTotals = {
  credits: 0,
  debits: 0,
  net: 0,
  overdue: 0,
  toPay: 0,
  toReceive: 0,
};

type Style = "wallet" | "simple";

/** How an account is drawn, its wallet's colors and its card's network. */
function LookFields({
  style,
  onStyleChange,
  look,
  onLookChange,
  account,
}: {
  style: Style;
  onStyleChange: (style: Style) => void;
  look: AccountLook;
  onLookChange: (look: AccountLook) => void;
  /** What the preview shows, so picking shows the wallet as it would be. */
  account: { title: string; currency: Fiat; excluded: boolean };
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium" id={`${id}-style`}>
          Look
        </span>
        <Tabs onValueChange={onStyleChange} value={style}>
          <TabsList aria-labelledby={`${id}-style`}>
            <TabsTrigger value="wallet">Wallet</TabsTrigger>
            <TabsTrigger value="simple">Simple</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      {style === "wallet" && (
        <>
          <WalletCard
            animate
            currency={account.currency}
            excluded={account.excluded}
            look={look}
            title={account.title.trim() || "Checking"}
          >
            <Figures
              currency={account.currency}
              note="This month’s net shows here"
              totals={NO_TOTALS}
              wallet
            />
          </WalletCard>
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium" id={`${id}-wallet`}>
              Wallet
            </span>
            <HexSwatchPicker
              aria-labelledby={`${id}-wallet`}
              onChange={(wallet) => onLookChange({ ...look, wallet })}
              swatches={WALLET_COLORS}
              value={look.wallet}
            />
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium" id={`${id}-card`}>
              Card
            </span>
            <HexSwatchPicker
              aria-labelledby={`${id}-card`}
              onChange={(card) => onLookChange({ ...look, card })}
              swatches={CARD_COLORS}
              value={look.card}
            />
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium" id={`${id}-network`}>
              Network
            </span>
            <Tabs
              onValueChange={(next: CardNetwork | "none") => {
                const { network: _, ...rest } = look;
                onLookChange(
                  next === "none" ? rest : { ...rest, network: next }
                );
              }}
              value={look.network ?? "none"}
            >
              <TabsList aria-labelledby={`${id}-network`}>
                <TabsTrigger value="none">None</TabsTrigger>
                {CARD_NETWORKS.map((network) => (
                  <TabsTrigger key={network} value={network}>
                    {NETWORK_NAMES[network]}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>
        </>
      )}
    </div>
  );
}

interface AccountFormProps {
  project: Project;
  /** The account to change; a new one starts otherwise. */
  account?: Account;
  onDone: () => void;
}

function AccountForm({ project, account, onDone }: AccountFormProps) {
  const id = useId();
  const me = useMe();
  const [, navigate] = useLocation();
  const [title, setTitle] = useState(account?.title ?? "");
  const [description, setDescription] = useState(account?.description ?? "");
  const [currency, setCurrency] = useState<Fiat>(
    account?.currency ?? me.currency
  );
  const [excludedFromTotal, setExcludedFromTotal] = useState(
    account?.excludedFromTotal ?? false
  );
  // New accounts start in a wallet; ones already plain stay so until changed.
  const [style, setStyle] = useState<Style>(
    account && !account.look ? "simple" : "wallet"
  );
  const [look, setLook] = useState<AccountLook>(account?.look ?? DEFAULT_LOOK);
  const [saving, setSaving] = useState(false);
  const valid = title.trim() !== "";

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!valid) {
      return;
    }
    const draft = {
      currency,
      description: description.trim(),
      excludedFromTotal,
      look: style === "wallet" ? look : null,
      title: title.trim(),
    };
    if (account) {
      updateAccount(account, draft);
      onDone();
      return;
    }
    setSaving(true);
    const accountId = await createAccount(project._id, draft);
    setSaving(false);
    if (accountId) {
      onDone();
      navigate(accountPath(project, { _id: accountId, title: draft.title }));
    }
  };

  return (
    <form className="flex flex-col gap-5" onSubmit={submit}>
      <DialogHeader>
        <DialogTitle>
          {account ? "Account settings" : "New account"}
        </DialogTitle>
      </DialogHeader>

      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-title`}>Name</Label>
        <Input
          autoComplete="off"
          autoFocus={!account}
          id={`${id}-title`}
          maxLength={MAX_ACCOUNT_TITLE}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Checking"
          value={title}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-description`}>Description</Label>
        <Textarea
          id={`${id}-description`}
          onChange={(event) => setDescription(event.target.value)}
          value={description}
        />
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium" id={`${id}-currency`}>
          Currency
        </span>
        <Tabs
          onValueChange={(next: Fiat) => setCurrency(next)}
          value={currency}
        >
          <TabsList aria-labelledby={`${id}-currency`}>
            {FIATS.map((fiat) => (
              <TabsTrigger key={fiat} value={fiat}>
                {fiat}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        {account && currency !== account.currency && (
          <p className="text-muted-foreground text-xs">
            Amounts already entered stay as they are, now in {currency}.
          </p>
        )}
      </div>

      <LookFields
        account={{ currency, excluded: excludedFromTotal, title }}
        look={look}
        onLookChange={setLook}
        onStyleChange={setStyle}
        style={style}
      />

      <p className="text-muted-foreground -mt-1 text-xs">
        Everyone on the project sees the account; whoever can edit the project
        can add to it.
      </p>

      <SwitchRow
        checked={excludedFromTotal}
        hint="Its months don’t count toward the project’s accounts together."
        id={`${id}-excluded`}
        label="Leave out of total"
        onChange={setExcludedFromTotal}
      />

      <DialogFooter className="mt-1">
        {account && (
          <DeleteAccount
            account={account}
            onDeleted={onDone}
            project={project}
          />
        )}
        <DialogClose render={<Button type="button" variant="ghost" />}>
          Cancel
        </DialogClose>
        <Button disabled={!valid || saving} type="submit">
          {saving && <Spinner />}
          {account ? "Save" : "Create account"}
        </Button>
      </DialogFooter>
    </form>
  );
}

type AccountDialogProps = Omit<AccountFormProps, "onDone"> & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function AccountDialog({
  open,
  onOpenChange,
  ...props
}: AccountDialogProps) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent showCloseButton={false}>
        <AccountForm {...props} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

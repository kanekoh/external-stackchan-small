import { CommandRequest } from "../types";

export function buildCommandBlocks(cmd: CommandRequest) {
  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${cmd.type}* を実行してもいい？`,
      },
      fields: [
        {
          type: "mrkdwn",
          text: "ペイロード",
        },
        {
          type: "mrkdwn",
          text: "```" + JSON.stringify(cmd.payload, null, 2) + "```",
        },
      ],
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "Yes" },
          style: "primary",
          action_id: "run_command_yes",
          value: JSON.stringify(cmd),
        },
        {
          type: "button",
          text: { type: "plain_text", text: "No" },
          style: "danger",
          action_id: "run_command_no",
        },
      ],
    },
  ];
}

export function buildDangerBlocks(cmd: CommandRequest) {
  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*ちょっと強めのコマンドだよ: ${cmd.type}*\nほんとに実行していい？`,
      },
      fields: [
        {
          type: "mrkdwn",
          text: "ペイロード",
        },
        {
          type: "mrkdwn",
          text: "```" + JSON.stringify(cmd.payload, null, 2) + "```",
        },
      ],
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "Yes, do it" },
          style: "primary",
          action_id: "run_command_yes",
          value: JSON.stringify(cmd),
        },
        {
          type: "button",
          text: { type: "plain_text", text: "Nope" },
          style: "danger",
          action_id: "run_command_no",
        },
      ],
    },
  ];
}

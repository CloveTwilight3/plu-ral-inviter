import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits, GuildMember, Channel } from 'discord.js';
import { ROLES } from '../config/roles.js';
import { database } from '../database/database.js';

export const data = new SlashCommandBuilder()
  .setName('inviter')
  .setDescription('Userproxy management commands')
  .addSubcommand(subcommand =>
    subcommand
      .setName('userproxy')
      .setDescription('Request a userproxy with specified roles')
      .addStringOption(option =>
        option
          .setName('id')
          .setDescription('The user ID for the proxy')
          .setRequired(true))
      .addStringOption(option =>
        option
          .setName('color')
          .setDescription('Color role')
          .setRequired(false)
          .addChoices(
            ...Object.keys(ROLES.colors).map(color => ({
              name: color,
              value: color
            }))
          ))
      .addStringOption(option =>
        option
          .setName('age')
          .setDescription('Age role')
          .setRequired(false)
          .addChoices(
            ...Object.keys(ROLES.ages).map(age => ({
              name: age,
              value: age
            }))
          ))
      .addStringOption(option =>
        option
          .setName('pronouns')
          .setDescription('Pronoun role')
          .setRequired(false)
          .addChoices(
            ...Object.keys(ROLES.pronouns).map(pronoun => ({
              name: pronoun,
              value: pronoun
            }))
          ))
      .addBooleanOption(option =>
        option
          .setName('mc_access')
          .setDescription('Minecraft access')
          .setRequired(false))
      .addBooleanOption(option =>
        option
          .setName('support_access')
          .setDescription('Support access')
          .setRequired(false))
      .addBooleanOption(option =>
        option
          .setName('selfies_access')
          .setDescription('Selfies access')
          .setRequired(false))
      .addBooleanOption(option =>
        option
          .setName('firearm_access')
          .setDescription('Firearm access')
          .setRequired(false))
      .addBooleanOption(option =>
        option
          .setName('zomboid_access')
          .setDescription('Zomboid access')  
          .setRequired(false)))
  .addSubcommand(subcommand =>
    subcommand
      .setName('setchannel')
      .setDescription('Set the mod channel for proxy requests')
      .addChannelOption(option =>
        option
          .setName('channel')
          .setDescription('The channel to send requests to')
          .setRequired(true)));

export async function execute(interaction: ChatInputCommandInteraction) {
  const subcommand = interaction.options.getSubcommand();

  if (subcommand === 'userproxy') {
    await handleUserproxyCommand(interaction);
  } else if (subcommand === 'setchannel') {
    await handleSetchannelCommand(interaction);
  }
}

async function handleUserproxyCommand(interaction: ChatInputCommandInteraction) {
  const proxyId = interaction.options.getString('id', true);
  
  // Validate user ID format
  if (!/^\d{17,19}$/.test(proxyId)) {
    await interaction.reply({
      content: 'Invalid user ID format. Please provide a valid Discord user ID.',
      ephemeral: true
    });
    return;
  }

  const modChannelId = await database.getModChannel(interaction.guildId!);
  if (!modChannelId) {
    await interaction.reply({
      content: 'No mod channel has been set. Please ask a moderator to use `/inviter setchannel` first.',
      ephemeral: true
    });
    return;
  }

  const modChannel = interaction.guild?.channels.cache.get(modChannelId);
  if (!modChannel || !('send' in modChannel)) {
    await interaction.reply({
      content: 'The configured mod channel is invalid. Please ask a moderator to reconfigure it.',
      ephemeral: true
    });
    return;
  }

  // Collect requested roles
  const requestedRoles: Record<string, string | boolean> = {};
  
  const color = interaction.options.getString('color');
  const age = interaction.options.getString('age');
  const pronouns = interaction.options.getString('pronouns');
  
  if (color) requestedRoles.color = color;
  if (age) requestedRoles.age = age;
  if (pronouns) requestedRoles.pronouns = pronouns;

  // Access roles
  const accessRoles = ['mc_access', 'support_access', 'selfies_access', 'firearm_access', 'zomboid_access'];
  for (const accessRole of accessRoles) {
    const value = interaction.options.getBoolean(accessRole);
    if (value === true) {
      requestedRoles[accessRole] = true;
    }
  }

  // Construct OAuth URL
  const oauthUrl = `https://discord.com/oauth2/authorize?client_id=${proxyId}&permissions=0&integration_type=0&scope=bot`;

  // Create embed for mod channel
  const embed = new EmbedBuilder()
    .setTitle('🤖 New Userproxy Request')
    .setColor(0x5865F2)
    .addFields(
      { name: 'Requested by', value: `<@${interaction.user.id}>`, inline: true },
      { name: 'Proxy ID', value: proxyId, inline: true },
      { name: 'OAuth URL', value: `[Click to invite proxy](${oauthUrl})` },
      { name: '⚠️ Important', value: '**The bot must be invited to the server first before approval!**', inline: false }
    )
    .setTimestamp();

  // Add requested roles to embed
  if (Object.keys(requestedRoles).length > 0) {
    const rolesList = Object.entries(requestedRoles)
      .map(([key, value]) => {
        if (key === 'color' || key === 'age' || key === 'pronouns') {
          return `${key}: ${value}`;
        }
        return key.replace('_access', ' access');
      })
      .join('\n');
    
    embed.addFields({ name: 'Requested Roles', value: rolesList });
  }

  // Create approval buttons
  const row = new ActionRowBuilder<ButtonBuilder>()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(`approve_proxy_${proxyId}`)
        .setLabel('Approve')
        .setStyle(ButtonStyle.Success)
        .setEmoji('✅'),
      new ButtonBuilder()
        .setCustomId(`deny_proxy_${proxyId}`)
        .setLabel('Deny')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('❌')
    );

  // Send to mod channel
  const modMessage = await modChannel.send({
    embeds: [embed],
    components: [row]
  });

  // Save pending request to database
  await database.savePendingRequest(modMessage.id, interaction.user.id, proxyId, requestedRoles);

  await interaction.reply({
    content: '✅ Your userproxy request has been submitted to the moderators!',
    ephemeral: true
  });
}

async function handleSetchannelCommand(interaction: ChatInputCommandInteraction) {
  // Check if user has mod role
  const member = interaction.member as GuildMember;
  
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) && 
      !member?.roles.cache.has(ROLES.mod)) {
    await interaction.reply({
      content: 'You do not have permission to use this command.',
      ephemeral: true
    });
    return;
  }

  const channel = interaction.options.getChannel('channel', true);
  
  if (!('send' in channel)) {
    await interaction.reply({
      content: 'Please select a text channel.',
      ephemeral: true
    });
    return;
  }

  await database.setModChannel(interaction.guildId!, channel.id);

  await interaction.reply({
    content: `✅ Mod channel set to ${channel}`,
    ephemeral: true
  });
}
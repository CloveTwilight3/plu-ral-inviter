import { Client, GatewayIntentBits, REST, Routes, Collection } from 'discord.js';
import dotenv from 'dotenv';
import { database } from './database/database.js';
import { handleButtonInteraction } from './handlers/buttonHandler.js';
import { handleMemberLeave } from './handlers/memberLeaveHandler.js';
import * as inviterCommand from './commands/inviter.js';

dotenv.config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
  ],
});

// Command collection
const commands = new Collection();
commands.set(inviterCommand.data.name, inviterCommand);

client.once('ready', async () => {
  console.log(`Ready! Logged in as ${client.user?.tag}`);
  
  // Connect to database
  await database.connect();
  
  // Register slash commands
  const rest = new REST().setToken(process.env.DISCORD_TOKEN!);
  
  try {
    console.log('Started refreshing application (/) commands.');
    
    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID!),
      { body: [inviterCommand.data.toJSON()] },
    );
    
    console.log('Successfully reloaded application (/) commands.');
  } catch (error) {
    console.error('Error registering commands:', error);
  }
});

client.on('interactionCreate', async interaction => {
  if (interaction.isChatInputCommand()) {
    const command = commands.get(interaction.commandName);
    if (!command) return;

    try {
      await command.execute(interaction);
    } catch (error) {
      console.error('Error executing command:', error);
      
      const errorMessage = {
        content: 'There was an error while executing this command!',
        ephemeral: true
      };
      
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(errorMessage);
      } else {
        await interaction.reply(errorMessage);
      }
    }
  } else if (interaction.isButton()) {
    await handleButtonInteraction(interaction);
  }
});

// Handle member leaving - remove their proxies
client.on('guildMemberRemove', async member => {
  await handleMemberLeave(member);
});

client.login(process.env.DISCORD_TOKEN);